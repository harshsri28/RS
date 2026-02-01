// src/internal/temporal/workflows/ride_matching.js
import { proxyActivities, sleep, defineSignal, setHandler, condition } from '@temporalio/workflow';
import { MATCHING_ACTIVITIES } from '../activities/matching.js';

// Define signals for external communication
export const driverResponseSignal = defineSignal('driverResponse');
export const cancelMatchingSignal = defineSignal('cancelMatching');

// Workflow configuration
const DEFAULT_INITIAL_RADIUS_KM = 5.0;
const MAX_RADIUS_KM = 15.0;
const MAX_MATCHING_ATTEMPTS = 3;
const DRIVER_RESPONSE_TIMEOUT_MS = 20000;

export async function rideMatchingWorkflow(input) {
  const {
    rideId,
    tenantId,
    riderId,
    vehicleType,
    pickupLatitude,
    pickupLongitude
  } = input;

  // Create activity proxies with timeouts
  const activities = proxyActivities({
    startToCloseTimeout: '30 seconds',
    retry: {
      maximumAttempts: 3
    }
  });

  // State
  let cancelled = false;
  let driverResponses = {};

  // Set up signal handlers
  setHandler(cancelMatchingSignal, () => {
    cancelled = true;
  });

  setHandler(driverResponseSignal, (response) => {
    driverResponses[response.driverId] = response;
  });

  console.log(`Starting ride matching workflow for ride: ${rideId}`);

  let currentRadius = DEFAULT_INITIAL_RADIUS_KM;
  let matchingAttempt = 0;

  while (!cancelled && matchingAttempt < MAX_MATCHING_ATTEMPTS) {
    matchingAttempt++;
    console.log(`Matching attempt ${matchingAttempt} with radius ${currentRadius}km`);

    // Step 1: Find nearby available drivers
    const findResult = await activities.findNearbyDrivers({
      rideId,
      tenantId,
      vehicleType,
      pickupLatitude,
      pickupLongitude,
      radiusKm: currentRadius
    });

    if (cancelled) {
      console.log('Matching cancelled');
      return { success: false, reason: 'cancelled' };
    }

    if (!findResult.drivers || findResult.drivers.length === 0) {
      console.log('No drivers found nearby, expanding radius');
      
      // Expand search radius
      const expandResult = await activities.expandSearchRadius({
        tenantId,
        vehicleType,
        pickupLatitude,
        pickupLongitude,
        currentRadius,
        maxRadius: MAX_RADIUS_KM
      });

      currentRadius = expandResult.newRadius;

      if (expandResult.exhausted && (!expandResult.drivers || expandResult.drivers.length === 0)) {
        // No more drivers to search
        break;
      }

      continue;
    }

    console.log(`Found ${findResult.drivers.length} drivers`);

    // Step 2: Sequential offer to drivers with timeout
    for (let i = 0; i < findResult.drivers.length; i++) {
      if (cancelled) {
        return { success: false, reason: 'cancelled' };
      }

      const driver = findResult.drivers[i];
      console.log(`Offering ride to driver ${driver.id} (attempt ${i + 1}/${findResult.drivers.length})`);

      const offerResult = await activities.offerRideToDriver({
        rideId,
        driverId: driver.id,
        tenantId,
        timeoutMs: DRIVER_RESPONSE_TIMEOUT_MS
      });

      if (offerResult.accepted) {
        console.log(`Driver ${driver.id} accepted the ride`);

        // Step 3: Assign ride to driver
        try {
          await activities.assignRideToDriver({
            rideId,
            driverId: driver.id,
            tenantId
          });

          console.log(`Ride ${rideId} successfully assigned to driver ${driver.id}`);
          return {
            success: true,
            rideId,
            driverId: driver.id
          };
        } catch (error) {
          console.log(`Failed to assign ride to driver ${driver.id}: ${error.message}`);
          // Try next driver
          continue;
        }
      }

      console.log(`Driver ${driver.id} declined or timeout: ${offerResult.response}`);
    }

    // All drivers declined, expand radius
    console.log('All drivers declined, expanding search radius');
    
    const expandResult = await activities.expandSearchRadius({
      tenantId,
      vehicleType,
      pickupLatitude,
      pickupLongitude,
      currentRadius,
      maxRadius: MAX_RADIUS_KM
    });

    currentRadius = expandResult.newRadius;

    if (expandResult.exhausted) {
      break;
    }

    // Small delay before next attempt
    await sleep('2 seconds');
  }

  // Step 4: No driver found - notify rider
  console.log('No driver found after all attempts');
  
  await activities.notifyNoDriverFound({
    rideId,
    riderId,
    tenantId
  });

  return {
    success: false,
    rideId,
    reason: cancelled ? 'cancelled' : 'no_drivers_available'
  };
}

// Query handler for workflow status
export const getMatchingStatusQuery = {
  name: 'getMatchingStatus'
};

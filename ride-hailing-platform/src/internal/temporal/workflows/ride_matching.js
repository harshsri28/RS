// src/internal/temporal/workflows/ride_matching.js
import { proxyActivities, sleep, defineSignal, setHandler, condition } from '@temporalio/workflow';
import { MATCHING_ACTIVITIES } from '../activities/matching.js';

// Define signals for external communication
export const driverResponseSignal = defineSignal('driverResponse');
export const cancelMatchingSignal = defineSignal('cancelMatching');

// Workflow configuration
const DEFAULT_INITIAL_RADIUS_KM = 1.0;  // Start with 1km radius
const MAX_MATCHING_ATTEMPTS = 3;
const WAIT_TIME_PER_RADIUS_MS = 60000; // 60 seconds per radius level

export async function rideMatchingWorkflow(input) {
  const {
    rideId,
    tenantId,
    riderId,
    vehicleType,
    pickupLatitude,
    pickupLongitude,
    estimatedFare,
    pickupLocation,
    dropoffLocation
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
  let driverResponses = {}; // driverId -> { accepted: boolean, timestamp }
  let declinedDrivers = new Set(); // Drivers who explicitly declined
  let pendingDrivers = new Set(); // Drivers who have been sent offers
  let acceptedDriverId = null;

  // Set up signal handlers
  setHandler(cancelMatchingSignal, () => {
    cancelled = true;
  });

  setHandler(driverResponseSignal, (response) => {
    console.log(`Received driver response signal: driverId=${response.driverId}, accepted=${response.accepted}`);
    driverResponses[response.driverId] = response;
    
    if (response.accepted) {
      acceptedDriverId = response.driverId;
    } else {
      // Driver explicitly declined - add to declined set
      declinedDrivers.add(response.driverId);
    }
    
    // Remove from pending
    pendingDrivers.delete(response.driverId);
  });

  console.log(`Starting ride matching workflow for ride: ${rideId}`);

  let currentRadius = DEFAULT_INITIAL_RADIUS_KM;
  
  // Strategy: Try initial radius -> wait 60s -> double radius -> wait 60s -> double again -> wait 60s -> stop
  for (let attempt = 1; attempt <= MAX_MATCHING_ATTEMPTS; attempt++) {
    if (cancelled) {
      console.log('Matching cancelled');
      return { success: false, reason: 'cancelled' };
    }

    console.log(`Matching attempt ${attempt} with radius ${currentRadius}km`);

    // Step 1: Find nearby available drivers (excluding those who declined)
    const findResult = await activities.findNearbyDrivers({
      rideId,
      tenantId,
      vehicleType,
      pickupLatitude,
      pickupLongitude,
      radiusKm: currentRadius,
      excludeDriverIds: Array.from(declinedDrivers)
    });

    if (cancelled) {
      console.log('Matching cancelled');
      return { success: false, reason: 'cancelled' };
    }

    const drivers = findResult.drivers || [];
    
    // Filter out drivers who already declined
    const eligibleDrivers = drivers.filter(d => !declinedDrivers.has(d.id) && !pendingDrivers.has(d.id));
    
    console.log(`Found ${drivers.length} drivers, ${eligibleDrivers.length} eligible (excluding ${declinedDrivers.size} declined, ${pendingDrivers.size} pending)`);

    if (eligibleDrivers.length > 0) {
      // Step 2: Send ride offers to all eligible drivers via WebSocket
      const rideDetails = {
        rideId,
        tenantId,
        riderId,
        vehicleType,
        estimatedFare,
        pickupLocation: {
          latitude: pickupLatitude,
          longitude: pickupLongitude,
          ...pickupLocation
        },
        dropoffLocation: dropoffLocation,
        expiresAt: new Date(Date.now() + WAIT_TIME_PER_RADIUS_MS).toISOString()
      };

      for (const driver of eligibleDrivers) {
        console.log(`Sending ride offer to driver ${driver.id}`);
        pendingDrivers.add(driver.id);
        
        // Send offer via WebSocket (non-blocking)
        await activities.sendRideOfferToDriver({
          driverId: driver.id,
          rideDetails,
          timeoutMs: WAIT_TIME_PER_RADIUS_MS
        });
      }
    } else {
      console.log(`No eligible drivers found in radius ${currentRadius}km`);
    }

    // Step 3: Wait for 60 seconds for any driver to accept
    console.log(`Waiting ${WAIT_TIME_PER_RADIUS_MS / 1000}s for driver responses...`);
    
    const hasAccepted = await condition(
      () => acceptedDriverId !== null || cancelled,
      WAIT_TIME_PER_RADIUS_MS
    );

    if (cancelled) {
      console.log('Matching cancelled during wait');
      // Notify pending drivers that ride is cancelled
      await activities.notifyRideCancelled({
        rideId,
        driverIds: Array.from(pendingDrivers)
      });
      return { success: false, reason: 'cancelled' };
    }

    // Check if a driver accepted
    if (acceptedDriverId) {
      console.log(`Driver ${acceptedDriverId} accepted the ride!`);
      
      // Verify driver is still available and assign
      const assignResult = await activities.assignRideToDriver({
        rideId,
        driverId: acceptedDriverId,
        tenantId
      });

      if (assignResult.success) {
        // Notify other pending drivers that ride is taken
        const otherDrivers = Array.from(pendingDrivers).filter(d => d !== acceptedDriverId);
        if (otherDrivers.length > 0) {
          await activities.notifyRideAssigned({
            rideId,
            driverIds: otherDrivers
          });
        }
        
        return { success: true, rideId, driverId: acceptedDriverId };
      } else {
        // Driver became unavailable, reset and continue
        console.log(`Driver ${acceptedDriverId} is no longer available`);
        acceptedDriverId = null;
      }
    }

    // No one accepted within the timeout
    console.log(`No driver accepted within timeout for radius ${currentRadius}km`);
    
    // Drivers who didn't respond (timeout) can be offered again with expanded radius
    // They stay in pendingDrivers but we DON'T add them to declined
    // Clear pending for next round - they may respond in expanded radius
    pendingDrivers.clear();
    
    if (attempt < MAX_MATCHING_ATTEMPTS) {
      // Double the radius for next attempt
      currentRadius *= 2;
      console.log(`Expanding radius to ${currentRadius}km for next attempt`);
    }
  }

  console.log('Matching exhausted after all attempts');
  
  // Step 4: Notify rider that no driver was found
  await activities.notifyNoDriverFound({
    rideId,
    riderId,
    tenantId
  });

  return { success: false, rideId, reason: 'no_drivers_available' };
}

// Query handler for workflow status
export const getMatchingStatusQuery = {
  name: 'getMatchingStatus'
};

// src/internal/temporal/activities/matching.js
import { DriverStatus } from '../../models/driver.js';
import { RideStatus } from '../../models/ride.js';

export function createMatchingActivities(driverRepo, rideRepo) {
  return {
    /**
     * Find nearby available drivers
     */
    async findNearbyDrivers(input) {
      const { tenantId, vehicleType, pickupLatitude, pickupLongitude, radiusKm = 5.0 } = input;

      const drivers = await driverRepo.findAvailableDrivers(
        tenantId,
        pickupLatitude,
        pickupLongitude,
        radiusKm,
        vehicleType,
        10 // limit
      );

      return {
        drivers: drivers.map(d => ({
          id: d.id,
          userId: d.userId,
          vehicleType: d.vehicleType,
          vehicleNumber: d.vehicleNumber,
          rating: d.rating,
          currentLocation: d.currentLocation,
          distance: d.distance
        }))
      };
    },

    /**
     * Offer ride to a driver
     * In real implementation, this would send a push notification and wait for response
     */
    async offerRideToDriver(input) {
      const { rideId, driverId, tenantId, timeoutMs = 15000 } = input;

      // Check if driver is still available
      const driver = await driverRepo.getById(driverId, tenantId);
      if (!driver || driver.status !== DriverStatus.AVAILABLE) {
        return {
          accepted: false,
          response: 'driver_unavailable'
        };
      }

      // In real implementation:
      // 1. Send push notification to driver
      // 2. Wait for response with timeout
      // 3. Return acceptance status

      // For now, simulate with a random acceptance (50% chance) after a delay
      return new Promise((resolve) => {
        setTimeout(() => {
          // Simulate 50% acceptance rate for testing
          const accepted = Math.random() > 0.5;
          resolve({
            accepted,
            response: accepted ? 'accepted' : 'timeout'
          });
        }, Math.min(timeoutMs, 3000)); // Cap at 3 seconds for testing
      });
    },

    /**
     * Assign ride to driver
     */
    async assignRideToDriver(input) {
      const { rideId, driverId, tenantId } = input;

      // Update ride with driver assignment using optimistic locking
      const assigned = await rideRepo.assignDriverWithLock(rideId, driverId);
      if (!assigned) {
        throw new Error('Ride already assigned or invalid state');
      }

      // Update driver status to busy
      await driverRepo.updateStatus(driverId, DriverStatus.BUSY);

      return { success: true };
    },

    /**
     * Notify rider that no driver was found
     */
    async notifyNoDriverFound(input) {
      const { rideId, riderId, tenantId } = input;

      // Update ride status
      await rideRepo.updateStatus(rideId, RideStatus.NO_DRIVER_FOUND || 'no_driver_found');

      // In real implementation: send push notification to rider
      console.log(`Notifying rider ${riderId} that no driver was found for ride ${rideId}`);

      return { notified: true };
    },

    /**
     * Expand search radius and find more drivers
     */
    async expandSearchRadius(input) {
      const { tenantId, vehicleType, pickupLatitude, pickupLongitude, currentRadius, maxRadius = 15.0 } = input;

      const newRadius = Math.min(currentRadius * 1.5, maxRadius);

      if (newRadius >= maxRadius && currentRadius >= maxRadius) {
        return { drivers: [], newRadius: maxRadius, exhausted: true };
      }

      const drivers = await driverRepo.findAvailableDrivers(
        tenantId,
        pickupLatitude,
        pickupLongitude,
        newRadius,
        vehicleType,
        10
      );

      return {
        drivers: drivers.map(d => ({
          id: d.id,
          userId: d.userId,
          vehicleType: d.vehicleType,
          vehicleNumber: d.vehicleNumber,
          rating: d.rating,
          currentLocation: d.currentLocation,
          distance: d.distance
        })),
        newRadius,
        exhausted: newRadius >= maxRadius
      };
    }
  };
}

export const MATCHING_ACTIVITIES = {
  FIND_NEARBY_DRIVERS: 'findNearbyDrivers',
  OFFER_RIDE_TO_DRIVER: 'offerRideToDriver',
  ASSIGN_RIDE_TO_DRIVER: 'assignRideToDriver',
  NOTIFY_NO_DRIVER_FOUND: 'notifyNoDriverFound',
  EXPAND_SEARCH_RADIUS: 'expandSearchRadius'
};

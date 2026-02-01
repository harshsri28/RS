// src/internal/temporal/activities/matching.js
import { DriverStatus } from '../../models/driver.js';
import { RideStatus } from '../../models/ride.js';
import { Exchanges } from '../../messaging/events.js';

export function createMatchingActivities(driverRepo, rideRepo, rabbitMQ = null) {
  // Helper function to publish WebSocket notification
  const publishWebSocketNotification = async (type, targetUserId, payload, targetUserIds = null) => {
    if (!rabbitMQ) {
      console.log('[Activity] RabbitMQ not available, cannot send WebSocket notification');
      return false;
    }

    const event = {
      type,
      targetUserId,
      targetUserIds,
      payload,
      timestamp: new Date().toISOString()
    };

    console.log(`[Activity] Publishing to RabbitMQ:`, JSON.stringify({
      exchange: Exchanges.WEBSOCKET,
      routingKey: 'ws.notification',
      type,
      targetUserId,
      payloadKeys: Object.keys(payload || {})
    }));

    try {
      await rabbitMQ.publish(Exchanges.WEBSOCKET, 'ws.notification', event);
      console.log(`[Activity] Published successfully to ${targetUserId}`);
      return true;
    } catch (error) {
      console.error('[Activity] Failed to publish WebSocket notification:', error);
      return false;
    }
  };

  return {
    /**
     * Find nearby available drivers
     */
    async findNearbyDrivers(input) {
      const { tenantId, vehicleType, pickupLatitude, pickupLongitude, radiusKm = 5.0, excludeDriverIds = [] } = input;

      const drivers = await driverRepo.findAvailableDrivers(
        tenantId,
        pickupLatitude,
        pickupLongitude,
        radiusKm,
        vehicleType,
        20 // Increased limit to handle exclusions
      );

      // Filter out excluded drivers
      const excludeSet = new Set(excludeDriverIds);
      const filteredDrivers = drivers.filter(d => !excludeSet.has(d.id));

      return {
        drivers: filteredDrivers.map(d => ({
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
     * Send ride offer to a driver via WebSocket (through RabbitMQ)
     * This is non-blocking - just sends the notification
     */
    async sendRideOfferToDriver(input) {
      const { driverId, rideDetails, timeoutMs = 60000 } = input;

      console.log(`[Activity] sendRideOfferToDriver called for driver ${driverId}`);

      // Check if driver is still available
      const driver = await driverRepo.getById(driverId, rideDetails.tenantId);
      if (!driver || driver.status !== DriverStatus.AVAILABLE) {
        console.log(`[Activity] Driver ${driverId} is not available (status: ${driver?.status}), skipping offer`);
        return { sent: false, reason: 'driver_unavailable' };
      }

      // Build the ride offer payload
      const payload = {
        ride_id: rideDetails.rideId,
        expires_at: rideDetails.expiresAt || new Date(Date.now() + timeoutMs).toISOString(),
        details: {
          pickup_address: rideDetails.pickupLocation?.address || 'Pickup location',
          dropoff_address: rideDetails.dropoffLocation?.address || 'Dropoff location',
          pickup_location: {
            latitude: rideDetails.pickupLocation?.latitude,
            longitude: rideDetails.pickupLocation?.longitude
          },
          dropoff_location: rideDetails.dropoffLocation ? {
            latitude: rideDetails.dropoffLocation.latitude,
            longitude: rideDetails.dropoffLocation.longitude
          } : null,
          estimated_fare: rideDetails.estimatedFare,
          vehicle_type: rideDetails.vehicleType,
          distance_km: rideDetails.distance_km
        }
      };

      console.log(`[Activity] Publishing ride offer to RabbitMQ for driver ${driverId}, rideId: ${rideDetails.rideId}`);

      // Send via RabbitMQ -> WebSocket consumer -> Driver's browser
      const sent = await publishWebSocketNotification('new_ride_offer', driverId, payload);
      console.log(`[Activity] Ride offer published to RabbitMQ for driver ${driverId}: ${sent}`);
      return { sent, delivered: sent ? 1 : 0 };
    },

    /**
     * Assign ride to driver
     */
    async assignRideToDriver(input) {
      const { rideId, driverId, tenantId } = input;

      try {
        // Check driver is still available
        const driver = await driverRepo.getById(driverId, tenantId);
        if (!driver || driver.status !== DriverStatus.AVAILABLE) {
          return { success: false, reason: 'driver_unavailable' };
        }

        // Update ride with driver assignment using optimistic locking
        const assigned = await rideRepo.assignDriverWithLock(rideId, driverId);
        if (!assigned) {
          return { success: false, reason: 'ride_already_assigned' };
        }

        // Update driver status to busy
        await driverRepo.updateStatus(driverId, DriverStatus.BUSY);

        // Send confirmation to driver via WebSocket
        await publishWebSocketNotification('ride_status_update', driverId, {
          ride_id: rideId,
          status: 'assigned',
          message: 'Ride assigned to you'
        });

        // Notify rider that driver is assigned
        const ride = await rideRepo.getById(rideId, tenantId);
        if (ride) {
          await publishWebSocketNotification('ride_status_update', ride.riderId, {
            ride_id: rideId,
            status: 'driver_assigned',
            driver_id: driverId,
            driver_name: driver.name || 'Your driver',
            vehicle_number: driver.vehicleNumber,
            vehicle_type: driver.vehicleType,
            rating: driver.rating
          });
        }

        return { success: true };
      } catch (error) {
        console.error(`Failed to assign ride ${rideId} to driver ${driverId}:`, error);
        return { success: false, reason: 'error', message: error.message };
      }
    },

    /**
     * Notify drivers that ride is cancelled
     */
    async notifyRideCancelled(input) {
      const { rideId, driverIds = [] } = input;

      if (driverIds.length > 0) {
        const payload = {
          ride_id: rideId,
          status: 'cancelled',
          message: 'Ride request was cancelled'
        };

        // Send to all drivers
        await publishWebSocketNotification('ride_status_update', null, payload, driverIds);
        console.log(`Notified ${driverIds.length} drivers that ride ${rideId} was cancelled`);
      }

      return { notified: driverIds.length };
    },

    /**
     * Notify drivers that ride was assigned to someone else
     */
    async notifyRideAssigned(input) {
      const { rideId, driverIds = [] } = input;

      if (driverIds.length > 0) {
        const payload = {
          ride_id: rideId,
          status: 'assigned_to_other',
          message: 'This ride was assigned to another driver'
        };

        // Send to all drivers
        await publishWebSocketNotification('ride_status_update', null, payload, driverIds);
        console.log(`Notified ${driverIds.length} drivers that ride ${rideId} was assigned to someone else`);
      }

      return { notified: driverIds.length };
    },

    /**
     * Notify rider that no driver was found
     */
    async notifyNoDriverFound(input) {
      const { rideId, riderId, tenantId } = input;

      // Update ride status
      await rideRepo.updateStatus(rideId, RideStatus.NO_DRIVER_FOUND || 'no_driver_found');

      // Send notification to rider via WebSocket
      await publishWebSocketNotification('ride_status_update', riderId, {
        ride_id: rideId,
        status: 'no_driver_found',
        message: 'No drivers available at the moment. Please try again.'
      });

      console.log(`Notifying rider ${riderId} that no driver was found for ride ${rideId}`);

      return { notified: true };
    },

    /**
     * Expand search radius and find more drivers
     */
    async expandSearchRadius(input) {
      const { tenantId, vehicleType, pickupLatitude, pickupLongitude, currentRadius, maxRadius = 15.0, excludeDriverIds = [] } = input;

      const newRadius = Math.min(currentRadius * 2, maxRadius);

      if (newRadius >= maxRadius && currentRadius >= maxRadius) {
        return { drivers: [], newRadius: maxRadius, exhausted: true };
      }

      const drivers = await driverRepo.findAvailableDrivers(
        tenantId,
        pickupLatitude,
        pickupLongitude,
        newRadius,
        vehicleType,
        20
      );

      // Filter out excluded drivers
      const excludeSet = new Set(excludeDriverIds);
      const filteredDrivers = drivers.filter(d => !excludeSet.has(d.id));

      return {
        drivers: filteredDrivers.map(d => ({
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
  SEND_RIDE_OFFER_TO_DRIVER: 'sendRideOfferToDriver',
  ASSIGN_RIDE_TO_DRIVER: 'assignRideToDriver',
  NOTIFY_RIDE_CANCELLED: 'notifyRideCancelled',
  NOTIFY_RIDE_ASSIGNED: 'notifyRideAssigned',
  NOTIFY_NO_DRIVER_FOUND: 'notifyNoDriverFound',
  EXPAND_SEARCH_RADIUS: 'expandSearchRadius'
};

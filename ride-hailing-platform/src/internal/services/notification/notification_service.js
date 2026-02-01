// src/internal/services/notification/notification_service.js
// Real-time notification service using WebSocket hub

import { logger } from '../../api/middlewares/logging.js';

/**
 * Message types for WebSocket notifications
 */
export const NotificationTypes = {
  // Ride events
  RIDE_STATUS_UPDATE: 'ride_status_update',
  RIDE_CREATED: 'ride_created',
  RIDE_CANCELLED: 'ride_cancelled',
  
  // Driver events
  NEW_RIDE_OFFER: 'new_ride_offer',
  RIDE_OFFER_EXPIRED: 'ride_offer_expired',
  DRIVER_ASSIGNED: 'driver_assigned',
  DRIVER_ARRIVED: 'driver_arrived',
  DRIVER_LOCATION_UPDATE: 'driver_location_update',
  
  // Trip events
  TRIP_STARTED: 'trip_started',
  TRIP_ENDED: 'trip_ended',
  TRIP_UPDATE: 'trip_update',
  
  // Payment events
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_FAILED: 'payment_failed',
  
  // System events
  SYSTEM_MESSAGE: 'system_message'
};

/**
 * NotificationService - handles real-time notifications to users via WebSocket
 */
export class NotificationService {
  constructor(hub) {
    this.hub = hub;
  }

  /**
   * Notify about ride status update
   * @param {object} ride - Ride object
   */
  notifyRideStatusUpdate(ride) {
    const payload = {
      ride_id: ride.id,
      status: ride.status,
      driver_id: ride.driver_id || null,
      pickup_location: ride.pickup_location,
      dropoff_location: ride.dropoff_location,
      estimated_fare: ride.estimated_fare,
      updated_at: new Date().toISOString()
    };

    // Notify rider
    this.hub.broadcastToUser(
      ride.rider_id,
      NotificationTypes.RIDE_STATUS_UPDATE,
      payload
    );

    // Notify driver if assigned
    if (ride.driver_id) {
      this.hub.broadcastToUser(
        ride.driver_id,
        NotificationTypes.RIDE_STATUS_UPDATE,
        payload
      );
    }

    logger.info({ rideId: ride.id, status: ride.status }, 'Ride status notification sent');
  }

  /**
   * Notify driver about new ride offer
   * @param {string} driverId - Driver ID
   * @param {string} rideId - Ride ID
   * @param {object} rideDetails - Ride details
   */
  notifyDriverAssignment(driverId, rideId, rideDetails) {
    const payload = {
      ride_id: rideId,
      details: {
        pickup_address: rideDetails.pickup_address || rideDetails.pickup_location?.address,
        dropoff_address: rideDetails.dropoff_address || rideDetails.dropoff_location?.address,
        pickup_location: rideDetails.pickup_location,
        dropoff_location: rideDetails.dropoff_location,
        estimated_fare: rideDetails.estimated_fare,
        vehicle_type: rideDetails.vehicle_type,
        distance_km: rideDetails.distance_km
      },
      expires_at: new Date(Date.now() + 30000).toISOString() // 30 second expiry
    };

    this.hub.broadcastToUser(
      driverId,
      NotificationTypes.NEW_RIDE_OFFER,
      payload
    );

    logger.info({ driverId, rideId }, 'New ride offer notification sent to driver');
  }

  /**
   * Notify rider about driver location update
   * @param {string} riderId - Rider ID
   * @param {string} driverId - Driver ID
   * @param {object} location - Location object { latitude, longitude }
   */
  notifyDriverLocationUpdate(riderId, driverId, location) {
    const payload = {
      driver_id: driverId,
      latitude: location.latitude,
      longitude: location.longitude,
      heading: location.heading,
      timestamp: location.timestamp || new Date().toISOString()
    };

    this.hub.broadcastToUser(
      riderId,
      NotificationTypes.DRIVER_LOCATION_UPDATE,
      payload
    );
  }

  /**
   * Notify rider that driver has been assigned
   * @param {string} riderId - Rider ID
   * @param {object} driverInfo - Driver information
   * @param {string} rideId - Ride ID
   */
  notifyDriverAssignedToRider(riderId, driverInfo, rideId) {
    const payload = {
      ride_id: rideId,
      driver: {
        id: driverInfo.id,
        name: driverInfo.name,
        phone: driverInfo.phone,
        rating: driverInfo.rating,
        vehicle: driverInfo.vehicle,
        estimated_arrival_minutes: driverInfo.estimated_arrival_minutes
      }
    };

    this.hub.broadcastToUser(
      riderId,
      NotificationTypes.DRIVER_ASSIGNED,
      payload
    );

    logger.info({ riderId, driverId: driverInfo.id, rideId }, 'Driver assigned notification sent to rider');
  }

  /**
   * Notify rider that driver has arrived
   * @param {string} riderId - Rider ID
   * @param {string} rideId - Ride ID
   * @param {object} driverInfo - Driver information
   */
  notifyDriverArrived(riderId, rideId, driverInfo) {
    const payload = {
      ride_id: rideId,
      driver_id: driverInfo.id,
      message: 'Your driver has arrived'
    };

    this.hub.broadcastToUser(
      riderId,
      NotificationTypes.DRIVER_ARRIVED,
      payload
    );

    logger.info({ riderId, rideId }, 'Driver arrived notification sent');
  }

  /**
   * Notify about trip start
   * @param {object} trip - Trip object
   */
  notifyTripStarted(trip) {
    const payload = {
      trip_id: trip.id,
      ride_id: trip.ride_id,
      started_at: trip.start_time,
      start_location: trip.start_location
    };

    // Notify both rider and driver
    this.hub.broadcastToUser(trip.rider_id, NotificationTypes.TRIP_STARTED, payload);
    this.hub.broadcastToUser(trip.driver_id, NotificationTypes.TRIP_STARTED, payload);

    logger.info({ tripId: trip.id }, 'Trip started notification sent');
  }

  /**
   * Notify about trip end
   * @param {object} trip - Trip object
   */
  notifyTripEnded(trip) {
    const payload = {
      trip_id: trip.id,
      ride_id: trip.ride_id,
      ended_at: trip.end_time,
      end_location: trip.end_location,
      final_fare: trip.final_fare,
      distance_km: trip.distance_km,
      duration_minutes: trip.duration_minutes
    };

    // Notify both rider and driver
    this.hub.broadcastToUser(trip.rider_id, NotificationTypes.TRIP_ENDED, payload);
    this.hub.broadcastToUser(trip.driver_id, NotificationTypes.TRIP_ENDED, payload);

    logger.info({ tripId: trip.id, fare: trip.final_fare }, 'Trip ended notification sent');
  }

  /**
   * Notify about payment received
   * @param {string} userId - User ID (rider or driver)
   * @param {object} paymentInfo - Payment information
   */
  notifyPaymentReceived(userId, paymentInfo) {
    const payload = {
      payment_id: paymentInfo.id,
      trip_id: paymentInfo.trip_id,
      amount: paymentInfo.amount,
      currency: paymentInfo.currency || 'INR',
      method: paymentInfo.method,
      status: 'completed'
    };

    this.hub.broadcastToUser(
      userId,
      NotificationTypes.PAYMENT_RECEIVED,
      payload
    );

    logger.info({ userId, paymentId: paymentInfo.id }, 'Payment notification sent');
  }

  /**
   * Send system message to user
   * @param {string} userId - User ID
   * @param {string} message - Message content
   * @param {string} level - Message level (info, warning, error)
   */
  sendSystemMessage(userId, message, level = 'info') {
    const payload = {
      message,
      level,
      timestamp: new Date().toISOString()
    };

    this.hub.broadcastToUser(
      userId,
      NotificationTypes.SYSTEM_MESSAGE,
      payload
    );
  }

  /**
   * Broadcast system message to all users
   * @param {string} message - Message content
   * @param {string} level - Message level
   */
  broadcastSystemMessage(message, level = 'info') {
    const payload = {
      message,
      level,
      timestamp: new Date().toISOString()
    };

    this.hub.broadcastAll(
      NotificationTypes.SYSTEM_MESSAGE,
      payload
    );
  }

  /**
   * Check if a user is connected
   * @param {string} userId - User ID
   * @returns {boolean}
   */
  isUserConnected(userId) {
    return this.hub.isUserConnected(userId);
  }

  /**
   * Get notification service stats
   * @returns {object}
   */
  getStats() {
    return this.hub.getStats();
  }
}

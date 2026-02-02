// src/internal/messaging/events.js

// Event types
export const EventTypes = {
  RIDE_REQUESTED: 'ride.requested',
  DRIVER_LOCATION_UPDATED: 'driver.location.updated',
  RIDE_ASSIGNED: 'ride.assigned',
  RIDE_ACCEPTED: 'ride.accepted',
  RIDE_DECLINED: 'ride.declined',
  RIDE_OFFER: 'ride.offer',
  RIDE_OFFER_EXPIRED: 'ride.offer.expired',
  RIDE_CANCELLED: 'ride.cancelled',
  NO_DRIVER_FOUND: 'ride.no_driver_found',
  TRIP_STARTED: 'trip.started',
  TRIP_ENDED: 'trip.ended',
  PAYMENT_INITIATED: 'payment.initiated'
};

// Exchanges
export const Exchanges = {
  RIDES: 'rides',
  DRIVERS: 'drivers',
  TRIPS: 'trips',
  PAYMENTS: 'payments',
  WEBSOCKET: 'websocket' // New exchange for WebSocket notifications
};

// Queues
export const Queues = {
  DRIVER_MATCHING: 'driver.matching',
  LOCATION_PROCESSING: 'location.processing',
  NOTIFICATIONS: 'notifications',
  PAYMENT_PROCESSING: 'payment.processing',
  WEBSOCKET_NOTIFICATIONS: 'websocket.notifications' // New queue for WS notifications
};

// Event classes
export class RideRequestedEvent {
  constructor(data) {
    this.rideId = data.rideId;
    this.tenantId = data.tenantId;
    this.riderId = data.riderId;
    this.vehicleType = data.vehicleType;
    this.pickupLatitude = data.pickupLatitude;
    this.pickupLongitude = data.pickupLongitude;
    this.pickupAddress = data.pickupAddress;
    this.dropoffLatitude = data.dropoffLatitude;
    this.dropoffLongitude = data.dropoffLongitude;
    this.dropoffAddress = data.dropoffAddress;
    this.estimatedFare = data.estimatedFare !== undefined ? data.estimatedFare : data.estimated_fare;
    this.timestamp = data.timestamp || new Date();
  }

  static fromJSON(json) {
    return new RideRequestedEvent(json);
  }

  toJSON() {
    return {
      rideId: this.rideId,
      tenantId: this.tenantId,
      riderId: this.riderId,
      vehicleType: this.vehicleType,
      pickupLatitude: this.pickupLatitude,
      pickupLongitude: this.pickupLongitude,
      pickupAddress: this.pickupAddress,
      dropoffLatitude: this.dropoffLatitude,
      dropoffLongitude: this.dropoffLongitude,
      dropoffAddress: this.dropoffAddress,
      estimatedFare: this.estimatedFare,
      timestamp: this.timestamp
    };
  }
}

export class DriverLocationUpdatedEvent {
  constructor(data) {
    this.driverId = data.driverId;
    this.tenantId = data.tenantId;
    this.latitude = data.latitude;
    this.longitude = data.longitude;
    this.status = data.status;
    this.timestamp = data.timestamp || new Date();
  }

  static fromJSON(json) {
    return new DriverLocationUpdatedEvent(json);
  }

  toJSON() {
    return {
      driverId: this.driverId,
      tenantId: this.tenantId,
      latitude: this.latitude,
      longitude: this.longitude,
      status: this.status,
      timestamp: this.timestamp
    };
  }
}

export class RideAssignedEvent {
  constructor(data) {
    this.rideId = data.rideId;
    this.driverId = data.driverId;
    this.tenantId = data.tenantId;
    this.timestamp = data.timestamp || new Date();
  }

  static fromJSON(json) {
    return new RideAssignedEvent(json);
  }

  toJSON() {
    return {
      rideId: this.rideId,
      driverId: this.driverId,
      tenantId: this.tenantId,
      timestamp: this.timestamp
    };
  }
}

export class RideAcceptedEvent {
  constructor(data) {
    this.rideId = data.rideId;
    this.driverId = data.driverId;
    this.tenantId = data.tenantId;
    this.timestamp = data.timestamp || new Date();
  }

  static fromJSON(json) {
    return new RideAcceptedEvent(json);
  }

  toJSON() {
    return {
      rideId: this.rideId,
      driverId: this.driverId,
      tenantId: this.tenantId,
      timestamp: this.timestamp
    };
  }
}

export class RideDeclinedEvent {
  constructor(data) {
    this.rideId = data.rideId;
    this.driverId = data.driverId;
    this.tenantId = data.tenantId;
    this.reason = data.reason;
    this.timestamp = data.timestamp || new Date();
  }

  static fromJSON(json) {
    return new RideDeclinedEvent(json);
  }

  toJSON() {
    return {
      rideId: this.rideId,
      driverId: this.driverId,
      tenantId: this.tenantId,
      reason: this.reason,
      timestamp: this.timestamp
    };
  }
}

export class TripStartedEvent {
  constructor(data) {
    this.tripId = data.tripId;
    this.rideId = data.rideId;
    this.driverId = data.driverId;
    this.tenantId = data.tenantId;
    this.timestamp = data.timestamp || new Date();
  }

  static fromJSON(json) {
    return new TripStartedEvent(json);
  }

  toJSON() {
    return {
      tripId: this.tripId,
      rideId: this.rideId,
      driverId: this.driverId,
      tenantId: this.tenantId,
      timestamp: this.timestamp
    };
  }
}

export class TripEndedEvent {
  constructor(data) {
    this.tripId = data.tripId;
    this.rideId = data.rideId;
    this.driverId = data.driverId;
    this.tenantId = data.tenantId;
    this.finalFare = data.finalFare;
    this.timestamp = data.timestamp || new Date();
  }

  static fromJSON(json) {
    return new TripEndedEvent(json);
  }

  toJSON() {
    return {
      tripId: this.tripId,
      rideId: this.rideId,
      driverId: this.driverId,
      tenantId: this.tenantId,
      finalFare: this.finalFare,
      timestamp: this.timestamp
    };
  }
}

export class PaymentInitiatedEvent {
  constructor(data) {
    this.paymentId = data.paymentId;
    this.tripId = data.tripId;
    this.riderId = data.riderId;
    this.amount = data.amount;
    this.tenantId = data.tenantId;
    this.timestamp = data.timestamp || new Date();
  }

  static fromJSON(json) {
    return new PaymentInitiatedEvent(json);
  }

  toJSON() {
    return {
      paymentId: this.paymentId,
      tripId: this.tripId,
      riderId: this.riderId,
      amount: this.amount,
      tenantId: this.tenantId,
      timestamp: this.timestamp
    };
  }
}

// Ride offer event for WebSocket notification
export class RideOfferEvent {
  constructor(data) {
    this.type = 'new_ride_offer';
    this.targetUserId = data.targetUserId; // Driver ID to send to
    this.rideId = data.rideId;
    this.tenantId = data.tenantId;
    this.expiresAt = data.expiresAt;
    this.details = data.details || {};
    this.timestamp = data.timestamp || new Date();
  }

  static fromJSON(json) {
    return new RideOfferEvent(json);
  }

  toJSON() {
    return {
      type: this.type,
      targetUserId: this.targetUserId,
      rideId: this.rideId,
      tenantId: this.tenantId,
      expiresAt: this.expiresAt,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

// Generic WebSocket notification event
export class WebSocketNotificationEvent {
  constructor(data) {
    this.type = data.type; // WebSocket message type
    this.targetUserId = data.targetUserId; // User to send to
    this.targetUserIds = data.targetUserIds; // Multiple users to send to
    this.payload = data.payload; // Message payload
    this.timestamp = data.timestamp || new Date();
  }

  static fromJSON(json) {
    return new WebSocketNotificationEvent(json);
  }

  toJSON() {
    return {
      type: this.type,
      targetUserId: this.targetUserId,
      targetUserIds: this.targetUserIds,
      payload: this.payload,
      timestamp: this.timestamp
    };
  }
}

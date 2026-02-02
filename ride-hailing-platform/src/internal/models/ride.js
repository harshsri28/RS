// src/internal/models/ride.js
export const RideStatus = {
  REQUESTED: 'requested',
  SEARCHING_DRIVER: 'searching_driver',
  DRIVER_ASSIGNED: 'driver_assigned',
  DRIVER_ARRIVING: 'driver_arriving',
  TRIP_STARTED: 'trip_started',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export class Ride {
  constructor(data) {
    this.id = data.id;
    this.tenantId = data.tenant_id || data.tenantId;
    this.riderId = data.rider_id || data.riderId;
    this.driverId = data.driver_id || data.driverId;
    this.status = data.status || RideStatus.REQUESTED;
    this.vehicleType = data.vehicle_type || data.vehicleType;
    this.pickupLocation = data.pickup_location || {
      latitude: data.pickup_latitude,
      longitude: data.pickup_longitude,
      address: data.pickup_address
    };
    this.dropoffLocation = data.dropoff_location || {
      latitude: data.dropoff_latitude,
      longitude: data.dropoff_longitude,
      address: data.dropoff_address
    };
    this.estimatedFare = data.estimated_fare !== undefined ? data.estimated_fare : data.estimatedFare;
    this.requestedAt = data.requested_at || data.requestedAt;
    this.assignedAt = data.assigned_at || data.assignedAt;
    this.cancelledAt = data.cancelled_at || data.cancelledAt;
    this.cancellationReason = data.cancellation_reason || data.cancellationReason;
    this.idempotencyKey = data.idempotency_key || data.idempotencyKey;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  static toResponse(ride, driver = null) {
    const response = {
      id: ride.id,
      rider_id: ride.riderId,
      driver_id: ride.driverId,
      status: ride.status,
      vehicle_type: ride.vehicleType,
      pickup_location: ride.pickupLocation,
      dropoff_location: ride.dropoffLocation,
      estimated_fare: ride.estimatedFare,
      requested_at: ride.requestedAt,
      created_at: ride.createdAt,
      updated_at: ride.updatedAt
    };

    if (driver) {
      response.driver_details = {
        id: driver.id,
        vehicle_number: driver.vehicleNumber,
        rating: driver.rating
      };
    }

    return response;
  }

  /**
   * Convert to JSON for caching
   */
  toJSON() {
    return {
      id: this.id,
      tenant_id: this.tenantId,
      rider_id: this.riderId,
      driver_id: this.driverId,
      status: this.status,
      vehicle_type: this.vehicleType,
      pickup_location: this.pickupLocation,
      dropoff_location: this.dropoffLocation,
      estimated_fare: this.estimatedFare,
      requested_at: this.requestedAt,
      assigned_at: this.assignedAt,
      cancelled_at: this.cancelledAt,
      cancellation_reason: this.cancellationReason,
      idempotency_key: this.idempotencyKey,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }
}

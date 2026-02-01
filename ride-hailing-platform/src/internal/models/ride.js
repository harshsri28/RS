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
    this.estimatedFare = data.estimated_fare || data.estimatedFare;
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
      rideId: ride.id,
      status: ride.status,
      vehicleType: ride.vehicleType,
      pickupLocation: ride.pickupLocation,
      dropoffLocation: ride.dropoffLocation,
      estimatedFare: ride.estimatedFare,
      requestedAt: ride.requestedAt,
      createdAt: ride.createdAt
    };

    if (driver) {
      response.driverDetails = {
        id: driver.id,
        vehicleNumber: driver.vehicleNumber,
        rating: driver.rating
      };
    }

    return response;
  }
}

// src/internal/services/ride_service.js
import { v4 as uuidv4 } from 'uuid';
import { DomainErrors } from '../models/errors.js';
import { Ride, RideStatus } from '../models/ride.js';
import { RideRequestedEvent, Exchanges, EventTypes } from '../messaging/events.js';

export class RideService {
  constructor(rideRepo, driverRepo, fareCalculator, rabbitMQ = null) {
    this.rideRepo = rideRepo;
    this.driverRepo = driverRepo;
    this.fareCalculator = fareCalculator;
    this.rabbitMQ = rabbitMQ;
  }

  async createRide(tenantId, data, idempotencyKey) {
    // Check idempotency
    const existing = await this.rideRepo.getByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    // Estimate fare
    const estimatedFare = await this.fareCalculator.estimateFare(
      data.vehicle_type,
      data.pickup_location,
      data.dropoff_location
    );

    console.log(`[RideService] Estimated fare calculated: ${estimatedFare} for vehicle_type: ${data.vehicle_type}`);

    const now = new Date();
    const ride = new Ride({
      id: uuidv4(),
      tenant_id: tenantId,
      rider_id: data.rider_id,
      status: RideStatus.REQUESTED,
      vehicle_type: data.vehicle_type,
      pickup_location: data.pickup_location,
      dropoff_location: data.dropoff_location,
      estimated_fare: estimatedFare,
      requested_at: now,
      idempotency_key: idempotencyKey,
      created_at: now,
      updated_at: now
    });

    await this.rideRepo.create(ride);

    // Publish ride requested event for async driver matching
    if (this.rabbitMQ) {
      try {
        const event = new RideRequestedEvent({
          rideId: ride.id,
          tenantId: tenantId,
          riderId: data.rider_id,
          vehicleType: data.vehicle_type,
          pickupLatitude: data.pickup_location.latitude,
          pickupLongitude: data.pickup_location.longitude,
          pickupAddress: data.pickup_location.address,
          dropoffLatitude: data.dropoff_location.latitude,
          dropoffLongitude: data.dropoff_location.longitude,
          dropoffAddress: data.dropoff_location.address,
          estimatedFare: estimatedFare,
          timestamp: now
        });

        await this.rabbitMQ.publish(
          Exchanges.RIDES,
          EventTypes.RIDE_REQUESTED,
          event.toJSON()
        );

        // Update ride status to searching
        await this.rideRepo.updateStatus(ride.id, RideStatus.SEARCHING_DRIVER);
        ride.status = RideStatus.SEARCHING_DRIVER;
      } catch (publishError) {
        console.error('Failed to publish ride event:', publishError);
        // Don't fail the request, matching can be retried
      }
    }

    return ride;
  }

  async getRide(id, tenantId) {
    const ride = await this.rideRepo.getById(id, tenantId);
    if (!ride) throw DomainErrors.NOT_FOUND('ride');

    let driver = null;
    if (ride.driverId) {
      driver = await this.driverRepo.getById(ride.driverId, tenantId);
    }

    return { ride, driver };
  }

  async cancelRide(id, tenantId, reason) {
    const ride = await this.rideRepo.getById(id, tenantId);
    if (!ride) throw DomainErrors.NOT_FOUND('ride');

    if (ride.status === RideStatus.COMPLETED || ride.status === RideStatus.CANCELLED) {
      throw DomainErrors.INVALID_STATE_TRANSITION(ride.status, RideStatus.CANCELLED);
    }

    await this.rideRepo.cancel(id, reason);

    if (ride.driverId) {
      await this.driverRepo.updateStatus(ride.driverId, 'available');
    }
  }
}

// src/internal/services/trip_service.js
import { v4 as uuidv4 } from 'uuid';
import { DomainErrors } from '../models/errors.js';
import { Trip, TripStatus } from '../models/trip.js';
import { RideStatus } from '../models/ride.js';
import { DriverStatus } from '../models/driver.js';

export class TripService {
  constructor(tripRepo, rideRepo, driverRepo, fareCalculator) {
    this.tripRepo = tripRepo;
    this.rideRepo = rideRepo;
    this.driverRepo = driverRepo;
    this.fareCalculator = fareCalculator;
  }

  async startTrip(tenantId, data) {
    const ride = await this.rideRepo.getById(data.ride_id, tenantId);
    if (!ride) throw DomainErrors.NOT_FOUND('ride');

    if (!ride.driverId) throw new Error('Cannot start trip without assigned driver');

    const now = new Date();
    const trip = new Trip({
      id: uuidv4(),
      ride_id: data.ride_id,
      driver_id: ride.driverId,
      rider_id: ride.riderId,
      status: TripStatus.STARTED,
      start_location: data.start_location || ride.pickupLocation,
      start_time: now,
      surge_multiplier: 1.0,
      currency: 'INR',
      created_at: now,
      updated_at: now
    });

    await this.tripRepo.create(trip);
    await this.rideRepo.updateStatus(data.ride_id, RideStatus.TRIP_STARTED);
    await this.driverRepo.updateStatus(ride.driverId, DriverStatus.ON_TRIP);

    return trip;
  }

  async endTrip(tripId, tenantId, data) {
    const trip = await this.tripRepo.getById(tripId);
    if (!trip) throw DomainErrors.NOT_FOUND('trip');

    if (trip.status === TripStatus.ENDED || trip.status === TripStatus.COMPLETED) {
      throw DomainErrors.INVALID_STATE_TRANSITION(trip.status, TripStatus.ENDED);
    }

    const ride = await this.rideRepo.getById(trip.rideId, tenantId);

    const now = new Date();
    const endTime = data.end_time ? new Date(data.end_time) : now;
    
    let durationMinutes = data.duration_minutes;
    if (durationMinutes === undefined) {
      durationMinutes = Math.max(0, Math.round((endTime - new Date(trip.startTime)) / 60000));
    }
    
    const fareBreakdown = this.fareCalculator.calculateFare(
      ride.vehicleType,
      data.distance_km,
      durationMinutes,
      trip.surgeMultiplier
    );

    trip.status = TripStatus.ENDED;
    trip.endLocation = data.end_location || { latitude: data.latitude, longitude: data.longitude };
    trip.endTime = endTime;
    trip.distanceKm = data.distance_km;
    trip.durationMinutes = durationMinutes;
    trip.baseFare = fareBreakdown.baseFare;
    trip.distanceFare = fareBreakdown.distanceFare;
    trip.timeFare = fareBreakdown.timeFare;
    trip.totalFare = fareBreakdown.totalFare;

    await this.tripRepo.update(trip);
    await this.rideRepo.updateStatus(trip.rideId, RideStatus.COMPLETED);
    await this.driverRepo.updateStatus(trip.driverId, DriverStatus.AVAILABLE);
    await this.driverRepo.incrementTripCount(trip.driverId);

    return fareBreakdown;
  }

  async getTrip(id) {
    const trip = await this.tripRepo.getById(id);
    if (!trip) throw DomainErrors.NOT_FOUND('trip');
    return trip;
  }
}

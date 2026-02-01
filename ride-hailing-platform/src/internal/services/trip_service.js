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
    
    // Calculate distance from start to end location if not provided
    let distanceKm = data.distance_km;
    if (distanceKm === undefined || distanceKm === null) {
      const endLocation = data.end_location || { latitude: data.latitude, longitude: data.longitude };
      const startLocation = trip.startLocation || ride.pickupLocation;
      
      if (endLocation && startLocation) {
        distanceKm = this.calculateDistance(startLocation, endLocation);
      } else {
        // Use estimated distance from ride as fallback
        const pickupLoc = ride.pickupLocation;
        const dropoffLoc = ride.dropoffLocation;
        if (pickupLoc && dropoffLoc) {
          distanceKm = this.calculateDistance(pickupLoc, dropoffLoc);
        } else {
          distanceKm = 1; // Minimum fallback
        }
      }
    }
    
    const fareBreakdown = this.fareCalculator.calculateFare(
      ride.vehicleType,
      distanceKm,
      durationMinutes,
      trip.surgeMultiplier
    );

    trip.status = TripStatus.ENDED;
    trip.endLocation = data.end_location || { latitude: data.latitude, longitude: data.longitude };
    trip.endTime = endTime;
    trip.distanceKm = distanceKm;
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

  /**
   * Calculate distance between two points using Haversine formula
   */
  calculateDistance(from, to) {
    const R = 6371; // Earth radius in km
    const dLat = (to.latitude - from.latitude) * Math.PI / 180;
    const dLon = (to.longitude - from.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(from.latitude * Math.PI / 180) * Math.cos(to.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance * 1.3; // Road factor - actual road distance is typically 30% more than straight line
  }
}

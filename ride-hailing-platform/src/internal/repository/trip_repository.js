// src/internal/repository/trip_repository.js
import { Trip } from '../models/trip.js';
import { DomainErrors } from '../models/errors.js';

export class TripRepository {
  constructor(db) {
    this.db = db;
    this.table = 'trips';
  }

  async create(trip) {
    await this.db(this.table).insert({
      id: trip.id,
      ride_id: trip.rideId,
      driver_id: trip.driverId,
      rider_id: trip.riderId,
      status: trip.status,
      start_latitude: trip.startLocation.latitude,
      start_longitude: trip.startLocation.longitude,
      start_time: trip.startTime,
      surge_multiplier: trip.surgeMultiplier,
      currency: trip.currency,
      created_at: trip.createdAt,
      updated_at: trip.updatedAt
    });
  }

  async getById(id) {
    const row = await this.db(this.table).where({ id }).first();
    if (!row) return null;
    return new Trip(row);
  }

  async getByRideId(rideId) {
    const row = await this.db(this.table).where({ ride_id: rideId }).first();
    if (!row) return null;
    return new Trip(row);
  }

  async update(trip) {
    const affected = await this.db(this.table)
      .where({ id: trip.id })
      .update({
        status: trip.status,
        end_latitude: trip.endLocation?.latitude,
        end_longitude: trip.endLocation?.longitude,
        end_time: trip.endTime,
        distance_km: trip.distanceKm,
        duration_minutes: trip.durationMinutes,
        base_fare: trip.baseFare,
        distance_fare: trip.distanceFare,
        time_fare: trip.timeFare,
        total_fare: trip.totalFare,
        updated_at: new Date()
      });
    
    if (affected === 0) throw DomainErrors.NOT_FOUND('trip');
  }

  async updateStatus(id, status) {
    await this.db(this.table)
      .where({ id })
      .update({ status, updated_at: new Date() });
  }
}

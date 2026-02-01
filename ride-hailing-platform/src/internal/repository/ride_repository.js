// src/internal/repository/ride_repository.js
import { Ride } from '../models/ride.js';
import { DomainErrors } from '../models/errors.js';

export class RideRepository {
  constructor(db) {
    this.db = db;
    this.table = 'rides';
  }

  async create(ride) {
    await this.db(this.table).insert({
      id: ride.id,
      tenant_id: ride.tenantId,
      rider_id: ride.riderId,
      driver_id: ride.driverId,
      status: ride.status,
      vehicle_type: ride.vehicleType,
      pickup_latitude: ride.pickupLocation.latitude,
      pickup_longitude: ride.pickupLocation.longitude,
      pickup_address: ride.pickupLocation.address,
      dropoff_latitude: ride.dropoffLocation.latitude,
      dropoff_longitude: ride.dropoffLocation.longitude,
      dropoff_address: ride.dropoffLocation.address,
      estimated_fare: ride.estimatedFare,
      requested_at: ride.requestedAt,
      idempotency_key: ride.idempotencyKey,
      created_at: ride.createdAt,
      updated_at: ride.updatedAt
    });
  }

  async getById(id, tenantId) {
    const row = await this.db(this.table)
      .where({ id, tenant_id: tenantId })
      .first();
    
    if (!row) return null;
    return new Ride(row);
  }

  async getByIdempotencyKey(key) {
    const row = await this.db(this.table)
      .where({ idempotency_key: key })
      .first();
    
    if (!row) return null;
    return new Ride(row);
  }

  async updateStatus(id, status) {
    await this.db(this.table)
      .where({ id })
      .update({ status, updated_at: new Date() });
  }

  async assignDriver(rideId, driverId) {
    await this.db(this.table)
      .where({ id: rideId })
      .update({
        driver_id: driverId,
        status: 'driver_assigned',
        assigned_at: new Date(),
        updated_at: new Date()
      });
  }

  async cancel(id, reason) {
    await this.db(this.table)
      .where({ id })
      .update({
        status: 'cancelled',
        cancelled_at: new Date(),
        cancellation_reason: reason,
        updated_at: new Date()
      });
  }

  async getRidesByRider(riderId, tenantId, limit, offset) {
    const rows = await this.db(this.table)
      .where({ rider_id: riderId, tenant_id: tenantId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    
    return rows.map(r => new Ride(r));
  }
}

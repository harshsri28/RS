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
      driver_id: ride.driverId || null,
      status: ride.status,
      vehicle_type: ride.vehicleType,
      pickup_latitude: ride.pickupLocation.latitude,
      pickup_longitude: ride.pickupLocation.longitude,
      pickup_address: ride.pickupLocation.address || null,
      dropoff_latitude: ride.dropoffLocation.latitude,
      dropoff_longitude: ride.dropoffLocation.longitude,
      dropoff_address: ride.dropoffLocation.address || null,
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

  /**
   * Assign driver with optimistic locking to prevent race conditions
   * Only assigns if ride is in searching_driver status and has no driver
   */
  async assignDriverWithLock(rideId, driverId) {
    const result = await this.db(this.table)
      .where({ 
        id: rideId,
        status: 'searching_driver'
      })
      .whereNull('driver_id')
      .update({
        driver_id: driverId,
        status: 'driver_assigned',
        assigned_at: new Date(),
        updated_at: new Date()
      });

    return result > 0; // Returns true if update was successful
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

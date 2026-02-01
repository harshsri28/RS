// src/internal/repository/driver_repository.js
import { Driver } from '../models/driver.js';
import { DomainErrors } from '../models/errors.js';

export class DriverRepository {
  constructor(db) {
    this.db = db;
    this.table = 'drivers';
  }

  async create(driver) {
    await this.db(this.table).insert({
      id: driver.id,
      user_id: driver.userId,
      tenant_id: driver.tenantId,
      vehicle_type: driver.vehicleType,
      vehicle_number: driver.vehicleNumber,
      license_number: driver.licenseNumber,
      status: driver.status,
      current_latitude: driver.currentLocation?.latitude,
      current_longitude: driver.currentLocation?.longitude,
      rating: driver.rating,
      total_trips: driver.totalTrips,
      created_at: driver.createdAt,
      updated_at: driver.updatedAt
    });
  }

  async getById(id, tenantId) {
    const row = await this.db(this.table)
      .where({ id, tenant_id: tenantId })
      .first();
    
    if (!row) return null;
    return new Driver(row);
  }

  async update(driver) {
    const affected = await this.db(this.table)
      .where({ id: driver.id, tenant_id: driver.tenantId })
      .update({
        vehicle_type: driver.vehicleType,
        vehicle_number: driver.vehicleNumber,
        license_number: driver.licenseNumber,
        status: driver.status,
        current_latitude: driver.currentLocation?.latitude,
        current_longitude: driver.currentLocation?.longitude,
        rating: driver.rating,
        total_trips: driver.totalTrips,
        updated_at: new Date()
      });
    
    if (affected === 0) throw DomainErrors.NOT_FOUND('driver');
  }

  async updateStatus(id, status) {
    await this.db(this.table)
      .where({ id })
      .update({ status, updated_at: new Date() });
  }

  async updateLocation(id, lat, lng) {
    await this.db(this.table)
      .where({ id })
      .update({
        current_latitude: lat,
        current_longitude: lng,
        location_updated_at: new Date(),
        updated_at: new Date()
      });
  }

  async findAvailableDrivers(tenantId, lat, lng, radiusKm, vehicleType, limit = 10) {
    // Haversine formula in SQL
    const drivers = await this.db(this.table)
      .select('*')
      .select(this.db.raw(`
        (6371 * acos(cos(radians(?)) * cos(radians(current_latitude)) * 
        cos(radians(current_longitude) - radians(?)) + sin(radians(?)) * 
        sin(radians(current_latitude)))) AS distance
      `, [lat, lng, lat]))
      .where({
        tenant_id: tenantId,
        status: 'available',
        vehicle_type: vehicleType
      })
      .whereNotNull('current_latitude')
      .whereNotNull('current_longitude')
      .having('distance', '<=', radiusKm)
      .orderBy('distance', 'asc')
      .orderBy('rating', 'desc')
      .limit(limit);

    return drivers.map(d => new Driver(d));
  }

  async incrementTripCount(id) {
    await this.db(this.table)
      .where({ id })
      .increment('total_trips', 1)
      .update({ updated_at: new Date() });
  }
}

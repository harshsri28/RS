// src/internal/services/driver_service.js
import { v4 as uuidv4 } from 'uuid';
import { DomainErrors } from '../models/errors.js';
import { Driver, DriverStatus } from '../models/driver.js';

export class DriverService {
  constructor(driverRepo, rideRepo) {
    this.driverRepo = driverRepo;
    this.rideRepo = rideRepo;
  }

  async createDriver(tenantId, data) {
    const now = new Date();
    const driver = new Driver({
      id: uuidv4(),
      user_id: data.user_id,
      tenant_id: tenantId,
      vehicle_type: data.vehicle_type,
      vehicle_number: data.vehicle_number,
      license_number: data.license_number,
      status: DriverStatus.OFFLINE,
      rating: 5.0,
      total_trips: 0,
      created_at: now,
      updated_at: now
    });

    await this.driverRepo.create(driver);
    return driver;
  }

  async getDriver(id, tenantId) {
    const driver = await this.driverRepo.getById(id, tenantId);
    if (!driver) throw DomainErrors.NOT_FOUND('driver');
    return driver;
  }

  async updateLocation(id, tenantId, data) {
    const driver = await this.driverRepo.getById(id, tenantId);
    if (!driver) throw DomainErrors.NOT_FOUND('driver');

    await this.driverRepo.updateLocation(id, data.latitude, data.longitude);

    if (data.status) {
      await this.updateStatus(id, tenantId, data.status);
    }
  }

  async updateStatus(id, tenantId, status) {
    const driver = await this.driverRepo.getById(id, tenantId);
    if (!driver) throw DomainErrors.NOT_FOUND('driver');

    if (driver.status === DriverStatus.ON_TRIP && status !== DriverStatus.AVAILABLE) {
      throw DomainErrors.INVALID_STATE_TRANSITION(driver.status, status);
    }

    await this.driverRepo.updateStatus(id, status);
  }

  async acceptRide(id, tenantId, data) {
    const driver = await this.driverRepo.getById(id, tenantId);
    if (!driver) throw DomainErrors.NOT_FOUND('driver');

    if (driver.status !== DriverStatus.AVAILABLE) {
      throw DomainErrors.DRIVER_UNAVAILABLE(id);
    }

    const ride = await this.rideRepo.getById(data.ride_id, tenantId);
    if (!ride) throw DomainErrors.NOT_FOUND('ride');

    if (ride.status !== 'searching_driver' && ride.status !== 'requested') {
      throw new Error('Ride no longer available');
    }

    await this.rideRepo.assignDriver(data.ride_id, id);
    await this.driverRepo.updateStatus(id, DriverStatus.BUSY);
  }
}

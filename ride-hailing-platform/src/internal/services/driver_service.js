// src/internal/services/driver_service.js
import { v4 as uuidv4 } from 'uuid';
import { DomainErrors } from '../models/errors.js';
import { Driver, DriverStatus, VehicleType } from '../models/driver.js';
import { DriverLocationUpdatedEvent, Exchanges, EventTypes } from '../messaging/events.js';

export class DriverService {
  constructor(driverRepo, rideRepo, rabbitMQ = null, temporalClient = null) {
    this.driverRepo = driverRepo;
    this.rideRepo = rideRepo;
    this.rabbitMQ = rabbitMQ;
    this.temporalClient = temporalClient;
  }

  async createDriver(tenantId, data) {
    if (!Object.values(VehicleType).includes(data.vehicle_type)) {
      throw DomainErrors.VALIDATION_ERROR(`Invalid vehicle type: ${data.vehicle_type}. Allowed types are: ${Object.values(VehicleType).join(', ')}`);
    }

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

    // Publish to RabbitMQ for async processing (preferred for high-frequency updates)
    if (this.rabbitMQ) {
      try {
        const event = new DriverLocationUpdatedEvent({
          driverId: id,
          tenantId: tenantId,
          latitude: data.latitude,
          longitude: data.longitude,
          status: data.status,
          timestamp: new Date()
        });

        await this.rabbitMQ.publish(
          Exchanges.DRIVERS,
          EventTypes.DRIVER_LOCATION_UPDATED,
          event.toJSON()
        );
      } catch (publishError) {
        console.error('Failed to publish location event, falling back to sync:', publishError);
        // Fallback to synchronous update
        await this.driverRepo.updateLocation(id, data.latitude, data.longitude);
        if (data.status) {
          await this.driverRepo.updateStatus(id, data.status);
        }
      }
    } else {
      // Synchronous update when RabbitMQ not available
      await this.driverRepo.updateLocation(id, data.latitude, data.longitude);
      if (data.status) {
        await this.updateStatus(id, tenantId, data.status);
      }
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

  /**
   * Signal the Temporal workflow when a driver responds to a ride offer
   */
  async signalDriverResponse(rideId, driverId, accepted) {
    if (!this.temporalClient) {
      console.log('Temporal client not available, cannot signal workflow');
      return false;
    }

    try {
      const workflowId = `ride-matching-${rideId}`;
      const handle = this.temporalClient.workflow.getHandle(workflowId);
      
      await handle.signal('driverResponse', {
        driverId,
        accepted,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Signaled workflow ${workflowId} with driver ${driverId} response: ${accepted}`);
      return true;
    } catch (error) {
      console.error(`Failed to signal workflow for ride ${rideId}:`, error);
      // Workflow might have completed or not exist
      return false;
    }
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

    // Signal the Temporal workflow that this driver accepted
    // The workflow will handle the actual assignment
    const signaled = await this.signalDriverResponse(data.ride_id, id, true);
    
    if (!signaled) {
      // Fallback: If we can't signal the workflow, try to assign directly
      // This handles edge cases where workflow might have already completed
      console.log('Workflow signal failed, attempting direct assignment');
      await this.rideRepo.assignDriver(data.ride_id, id);
      await this.driverRepo.updateStatus(id, DriverStatus.BUSY);
    }
  }

  /**
   * Decline a ride offer
   */
  async declineRide(id, tenantId, data) {
    const driver = await this.driverRepo.getById(id, tenantId);
    if (!driver) throw DomainErrors.NOT_FOUND('driver');

    const ride = await this.rideRepo.getById(data.ride_id, tenantId);
    if (!ride) throw DomainErrors.NOT_FOUND('ride');

    // Signal the Temporal workflow that this driver declined
    await this.signalDriverResponse(data.ride_id, id, false);
  }
}

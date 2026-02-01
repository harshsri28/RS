// src/internal/api/handlers/driver_handler.js
import { successResponse, errorResponse } from './common.js';
import { Driver } from '../../models/driver.js';

export class DriverHandler {
  constructor(driverService) {
    this.driverService = driverService;
  }

  async createDriver(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      const driver = await this.driverService.createDriver(tenantId, req.body);
      successResponse(res, Driver.toResponse(driver), 201);
    } catch (err) {
      errorResponse(res, err);
    }
  }

  async getDriver(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      const driver = await this.driverService.getDriver(req.params.id, tenantId);
      successResponse(res, Driver.toResponse(driver));
    } catch (err) {
      errorResponse(res, err);
    }
  }

  async updateLocation(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      await this.driverService.updateLocation(req.params.id, tenantId, req.body);
      res.status(204).send();
    } catch (err) {
      errorResponse(res, err);
    }
  }

  async updateStatus(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      await this.driverService.updateStatus(req.params.id, tenantId, req.body.status);
      successResponse(res, { status: req.body.status, driverId: req.params.id });
    } catch (err) {
      errorResponse(res, err);
    }
  }

  async acceptRide(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      await this.driverService.acceptRide(req.params.id, tenantId, req.body);
      successResponse(res, { status: 'accepted', rideId: req.body.ride_id, driverId: req.params.id });
    } catch (err) {
      errorResponse(res, err);
    }
  }

  async declineRide(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      await this.driverService.declineRide(req.params.id, tenantId, req.body);
      successResponse(res, { status: 'declined', rideId: req.body.ride_id, driverId: req.params.id });
    } catch (err) {
      errorResponse(res, err);
    }
  }
}

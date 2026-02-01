// src/internal/api/handlers/ride_handler.js
import { successResponse, errorResponse, getPagination } from './common.js';
import { Ride } from '../../models/ride.js';

export class RideHandler {
  constructor(rideService) {
    this.rideService = rideService;
  }

  async createRide(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      const idempotencyKey = req.headers['idempotency-key'];
      const ride = await this.rideService.createRide(tenantId, req.body, idempotencyKey);
      successResponse(res, Ride.toResponse(ride), 201);
    } catch (err) {
      errorResponse(res, err);
    }
  }

  async getRide(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      const { ride, driver } = await this.rideService.getRide(req.params.id, tenantId);
      successResponse(res, Ride.toResponse(ride, driver));
    } catch (err) {
      errorResponse(res, err);
    }
  }

  async cancelRide(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      await this.rideService.cancelRide(req.params.id, tenantId, req.body.reason);
      successResponse(res, { status: 'cancelled', rideId: req.params.id });
    } catch (err) {
      errorResponse(res, err);
    }
  }
}

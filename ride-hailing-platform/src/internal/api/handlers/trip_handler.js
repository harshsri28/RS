// src/internal/api/handlers/trip_handler.js
import { successResponse, errorResponse } from './common.js';
import { Trip } from '../../models/trip.js';

export class TripHandler {
  constructor(tripService) {
    this.tripService = tripService;
  }

  async startTrip(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      const trip = await this.tripService.startTrip(tenantId, req.body);
      successResponse(res, Trip.toResponse(trip), 201);
    } catch (err) {
      errorResponse(res, err);
    }
  }

  async endTrip(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      const fareBreakdown = await this.tripService.endTrip(req.params.id, tenantId, req.body);
      successResponse(res, { tripId: req.params.id, ...fareBreakdown });
    } catch (err) {
      errorResponse(res, err);
    }
  }

  async getTrip(req, res) {
    try {
      const trip = await this.tripService.getTrip(req.params.id);
      successResponse(res, Trip.toResponse(trip));
    } catch (err) {
      errorResponse(res, err);
    }
  }
}

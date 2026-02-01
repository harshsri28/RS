// src/internal/api/handlers/trip_handler.js
import { successResponse, errorResponse } from './common.js';
import { Trip } from '../../models/trip.js';

export class TripHandler {
  constructor(tripService, notificationService = null) {
    this.tripService = tripService;
    this.notificationService = notificationService;
  }

  async startTrip(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      const trip = await this.tripService.startTrip(tenantId, req.body);
      
      // Send WebSocket notification to rider about trip start
      if (this.notificationService) {
        // Send ride_status_update so rider's UI updates
        this.notificationService.hub.broadcastToUser(trip.riderId, 'ride_status_update', {
          ride_id: trip.rideId,
          status: 'trip_started',
          trip_id: trip.id
        });
        console.log(`[TripHandler] Sent trip_started notification to rider ${trip.riderId}`);
      }
      
      successResponse(res, Trip.toResponse(trip), 201);
    } catch (err) {
      errorResponse(res, err);
    }
  }

  async endTrip(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      const tripService = this.tripService;
      const fareBreakdown = await tripService.endTrip(req.params.id, tenantId, req.body);
      
      // Get updated trip to include distance and duration
      const trip = await tripService.getTrip(req.params.id);
      
      // Send WebSocket notification to rider about trip completion
      if (this.notificationService && trip.riderId) {
        this.notificationService.hub.broadcastToUser(trip.riderId, 'ride_status_update', {
          ride_id: trip.rideId,
          status: 'completed',
          trip_id: trip.id,
          final_fare: fareBreakdown.totalFare,
          distance_km: trip.distanceKm,
          duration_minutes: trip.durationMinutes
        });
        console.log(`[TripHandler] Sent completed notification to rider ${trip.riderId}`);
      }
      
      successResponse(res, { 
        tripId: req.params.id, 
        distanceKm: trip.distanceKm,
        durationMinutes: trip.durationMinutes,
        ...fareBreakdown 
      });
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

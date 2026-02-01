// src/internal/models/trip.js
export const TripStatus = {
  STARTED: 'started',
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  ENDED: 'ended',
  COMPLETED: 'completed'
};

export class Trip {
  constructor(data) {
    this.id = data.id;
    this.rideId = data.ride_id || data.rideId;
    this.driverId = data.driver_id || data.driverId;
    this.riderId = data.rider_id || data.riderId;
    this.status = data.status || TripStatus.STARTED;
    this.startLocation = data.start_location || {
      latitude: data.start_latitude,
      longitude: data.start_longitude
    };
    this.endLocation = data.end_location || (data.end_latitude ? {
      latitude: data.end_latitude,
      longitude: data.end_longitude
    } : null);
    this.startTime = data.start_time || data.startTime;
    this.endTime = data.end_time || data.endTime;
    this.distanceKm = data.distance_km || data.distanceKm;
    this.durationMinutes = data.duration_minutes || data.durationMinutes;
    this.baseFare = data.base_fare || data.baseFare;
    this.distanceFare = data.distance_fare || data.distanceFare;
    this.timeFare = data.time_fare || data.timeFare;
    this.surgeMultiplier = data.surge_multiplier || data.surgeMultiplier || 1.0;
    this.totalFare = data.total_fare || data.totalFare;
    this.currency = data.currency || 'INR';
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  static toResponse(trip) {
    return {
      tripId: trip.id,
      rideId: trip.rideId,
      status: trip.status,
      startLocation: trip.startLocation,
      endLocation: trip.endLocation,
      startTime: trip.startTime,
      endTime: trip.endTime,
      distanceKm: trip.distanceKm,
      durationMinutes: trip.durationMinutes,
      totalFare: trip.totalFare,
      currency: trip.currency
    };
  }
}

// src/internal/models/driver.js
export const DriverStatus = {
  OFFLINE: 'offline',
  AVAILABLE: 'available',
  BUSY: 'busy',
  ON_TRIP: 'on_trip'
};

export const VehicleType = {
  ECONOMY: 'economy',
  PREMIUM: 'premium',
  LUXURY: 'luxury'
};

export class Driver {
  constructor(data) {
    this.id = data.id;
    this.userId = data.user_id || data.userId;
    this.tenantId = data.tenant_id || data.tenantId;
    this.vehicleType = data.vehicle_type || data.vehicleType;
    this.vehicleNumber = data.vehicle_number || data.vehicleNumber;
    this.licenseNumber = data.license_number || data.licenseNumber;
    this.status = data.status || DriverStatus.OFFLINE;
    this.currentLocation = data.current_location || (data.current_latitude ? {
      latitude: data.current_latitude,
      longitude: data.current_longitude
    } : null);
    this.locationUpdatedAt = data.location_updated_at || data.locationUpdatedAt;
    this.rating = data.rating || 5.0;
    this.totalTrips = data.total_trips || 0;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  static toResponse(driver) {
    return {
      id: driver.id,
      userId: driver.userId,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber,
      status: driver.status,
      currentLocation: driver.currentLocation,
      rating: driver.rating,
      totalTrips: driver.totalTrips,
      locationUpdatedAt: driver.locationUpdatedAt
    };
  }

  /**
   * Convert to JSON for caching
   */
  toJSON() {
    return {
      id: this.id,
      user_id: this.userId,
      tenant_id: this.tenantId,
      vehicle_type: this.vehicleType,
      vehicle_number: this.vehicleNumber,
      license_number: this.licenseNumber,
      status: this.status,
      current_location: this.currentLocation,
      location_updated_at: this.locationUpdatedAt,
      rating: this.rating,
      total_trips: this.totalTrips,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }
}

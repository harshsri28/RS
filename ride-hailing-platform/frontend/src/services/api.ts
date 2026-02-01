// src/services/api.ts
// API service for backend communication

import axios, { type AxiosInstance, type AxiosError } from 'axios';

// Types
export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface CreateRideRequest {
  rider_id: string;
  pickup_location: Location;
  dropoff_location: Location;
  vehicle_type: string;
  payment_method: string;
}

export interface RideResponse {
  id: string;
  rider_id: string;
  driver_id?: string;
  status: string;
  pickup_location: Location;
  dropoff_location: Location;
  vehicle_type: string;
  estimated_fare?: number;
  created_at: string;
  updated_at: string;
}

export interface DriverResponse {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  vehicle_type: string;
  vehicle_number?: string;
  status: string;
  rating?: number;
  current_location?: Location;
}

export interface TripResponse {
  tripId: string;
  id?: string; // Alias for tripId
  rideId?: string;
  ride_id?: string;
  driver_id?: string;
  rider_id?: string;
  status?: string;
  start_time?: string;
  end_time?: string;
  startTime?: string;
  endTime?: string;
  start_location?: Location;
  end_location?: Location;
  startLocation?: Location;
  endLocation?: Location;
  distance_km?: number;
  distanceKm?: number;
  duration_minutes?: number;
  durationMinutes?: number;
  final_fare?: number;
  totalFare?: number;
  baseFare?: number;
  distanceFare?: number;
  timeFare?: number;
  currency?: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  phone: string;
  user_type: 'rider' | 'driver';
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  phone: string;
  user_type: string;
  created_at: string;
}

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/v1';

// Create axios instance
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  // Request interceptor for auth token and idempotency key
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add tenant ID header
    const tenantId = localStorage.getItem('tenant_id') || 'default';
    config.headers['X-Tenant-ID'] = tenantId;

    // Add Idempotency-Key header for POST requests
    if (config.method?.toLowerCase() === 'post') {
      config.headers['Idempotency-Key'] = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    return config;
  });

  // Response interceptor for error handling
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        // Handle unauthorized - could redirect to login
        console.error('Unauthorized request');
      }
      return Promise.reject(error);
    }
  );

  return client;
};

export const api = createApiClient();

// Ride API
export const rideApi = {
  createRide: async (data: CreateRideRequest): Promise<RideResponse> => {
    const response = await api.post<RideResponse>('/rides', data);
    return response.data;
  },

  getRide: async (rideId: string): Promise<RideResponse> => {
    const response = await api.get<RideResponse>(`/rides/${rideId}`);
    return response.data;
  },

  cancelRide: async (rideId: string, reason?: string): Promise<RideResponse> => {
    const response = await api.post<RideResponse>(`/rides/${rideId}/cancel`, {
      reason,
    });
    return response.data;
  },
};

// Driver API
export const driverApi = {
  createDriver: async (data: {
    user_id: string;
    vehicle_type: string;
    vehicle_number: string;
    license_number: string;
  }): Promise<DriverResponse> => {
    const response = await api.post<DriverResponse>('/drivers', data);
    return response.data;
  },

  getDriver: async (driverId: string): Promise<DriverResponse> => {
    const response = await api.get<DriverResponse>(`/drivers/${driverId}`);
    return response.data;
  },

  updateLocation: async (driverId: string, latitude: number, longitude: number): Promise<void> => {
    await api.post(`/drivers/${driverId}/location`, {
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
    });
  },

  updateStatus: async (driverId: string, status: string): Promise<DriverResponse> => {
    const response = await api.post<DriverResponse>(`/drivers/${driverId}/status`, {
      status,
    });
    return response.data;
  },

  acceptRide: async (driverId: string, rideId: string, estimatedArrivalMinutes: number = 5): Promise<void> => {
    await api.post(`/drivers/${driverId}/accept`, {
      ride_id: rideId,
      estimated_arrival_minutes: estimatedArrivalMinutes,
    });
  },

  declineRide: async (driverId: string, rideId: string): Promise<void> => {
    await api.post(`/drivers/${driverId}/decline`, {
      ride_id: rideId,
    });
  },
};

// Trip API
export const tripApi = {
  startTrip: async (rideId: string, driverId: string): Promise<TripResponse> => {
    const response = await api.post<TripResponse>('/trips', {
      ride_id: rideId,
      driver_id: driverId,
    });
    return response.data;
  },

  getTrip: async (tripId: string): Promise<TripResponse> => {
    const response = await api.get<TripResponse>(`/trips/${tripId}`);
    return response.data;
  },

  endTrip: async (tripId: string, endLocation: Location): Promise<TripResponse> => {
    const response = await api.post<TripResponse>(`/trips/${tripId}/end`, {
      end_location: endLocation,
    });
    return response.data;
  },
};

// User API
export const userApi = {
  createUser: async (data: CreateUserRequest): Promise<UserResponse> => {
    const response = await api.post<UserResponse>('/users', data);
    return response.data;
  },

  getUser: async (userId: string): Promise<UserResponse> => {
    const response = await api.get<UserResponse>(`/users/${userId}`);
    return response.data;
  },
};

// Health API
export const healthApi = {
  check: async (): Promise<{ status: string; timestamp: string }> => {
    const response = await api.get('/health');
    return response.data;
  },
};

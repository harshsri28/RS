// src/internal/services/cached_ride_service.js
import { v4 as uuidv4 } from 'uuid';
import { DomainErrors } from '../models/errors.js';
import { Ride, RideStatus } from '../models/ride.js';
import { RideRequestedEvent, Exchanges, EventTypes } from '../messaging/events.js';
import { CacheKeys, CacheTTL } from '../../pkg/cache/redis.js';

/**
 * CachedRideService - Enhanced ride service with Redis caching
 */
export class CachedRideService {
  constructor(rideRepo, driverRepo, fareCalculator, cache, rabbitMQ = null, metrics = null) {
    this.rideRepo = rideRepo;
    this.driverRepo = driverRepo;
    this.fareCalculator = fareCalculator;
    this.cache = cache;
    this.rabbitMQ = rabbitMQ;
    this.metrics = metrics;
  }

  /**
   * Create a new ride request with caching
   */
  async createRide(tenantId, data, idempotencyKey) {
    const startTime = Date.now();
    
    // Check idempotency in cache first
    const idempotencyCacheKey = `idempotency:${idempotencyKey}`;
    const cachedRideId = await this.cache.get(idempotencyCacheKey);
    if (cachedRideId) {
      return await this.getRide(cachedRideId, tenantId);
    }
    
    // Check database idempotency
    const existing = await this.rideRepo.getByIdempotencyKey(idempotencyKey);
    if (existing) {
      // Cache for future lookups
      await this.cache.set(idempotencyCacheKey, existing.id, 3600); // 1 hour
      return existing;
    }
    
    // Estimate fare
    const estimatedFare = await this.fareCalculator.estimateFare(
      data.vehicle_type,
      data.pickup_location,
      data.dropoff_location
    );

    const now = new Date();
    const ride = new Ride({
      id: uuidv4(),
      tenant_id: tenantId,
      rider_id: data.rider_id,
      status: RideStatus.REQUESTED,
      vehicle_type: data.vehicle_type,
      pickup_location: data.pickup_location,
      dropoff_location: data.dropoff_location,
      estimated_fare: estimatedFare,
      requested_at: now,
      idempotency_key: idempotencyKey,
      created_at: now,
      updated_at: now
    });

    await this.rideRepo.create(ride);
    
    // Cache the ride and idempotency key
    const cacheKey = CacheKeys.ride(tenantId, ride.id);
    await Promise.all([
      this.cache.set(cacheKey, ride.toJSON(), CacheTTL.RIDE),
      this.cache.set(idempotencyCacheKey, ride.id, 3600)
    ]);
    
    // Publish ride requested event for async driver matching
    if (this.rabbitMQ) {
      try {
        const event = new RideRequestedEvent({
          rideId: ride.id,
          tenantId: tenantId,
          riderId: data.rider_id,
          vehicleType: data.vehicle_type,
          pickupLatitude: data.pickup_location.latitude,
          pickupLongitude: data.pickup_location.longitude,
          pickupAddress: data.pickup_location.address || `${data.pickup_location.latitude.toFixed(4)}, ${data.pickup_location.longitude.toFixed(4)}`,
          dropoffLatitude: data.dropoff_location.latitude,
          dropoffLongitude: data.dropoff_location.longitude,
          dropoffAddress: data.dropoff_location.address || `${data.dropoff_location.latitude.toFixed(4)}, ${data.dropoff_location.longitude.toFixed(4)}`,
          estimatedFare: estimatedFare,
          timestamp: now
        });

        await this.rabbitMQ.publish(
          Exchanges.RIDES,
          EventTypes.RIDE_REQUESTED,
          event.toJSON()
        );

        // Update ride status to searching
        await this.updateRideStatus(ride.id, tenantId, RideStatus.SEARCHING_DRIVER);
        ride.status = RideStatus.SEARCHING_DRIVER;
      } catch (publishError) {
        console.error('Failed to publish ride event:', publishError);
        // Don't fail the request, matching can be retried
      }
    }
    
    // Record metrics
    this.recordRideCreated(tenantId, data.vehicle_type, Date.now() - startTime);
    
    return ride;
  }

  /**
   * Get ride by ID with caching
   */
  async getRide(id, tenantId) {
    const cacheKey = CacheKeys.ride(tenantId, id);
    
    // Try cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.recordCacheHit('ride');
      const ride = new Ride(cached);
      
      // Get driver details if assigned
      let driver = null;
      if (ride.driverId) {
        driver = await this.getDriverFromCache(ride.driverId, tenantId);
      }
      
      return { ride, driver };
    }
    
    this.recordCacheMiss('ride');
    
    // Fallback to database
    const ride = await this.rideRepo.getById(id, tenantId);
    if (!ride) throw DomainErrors.NOT_FOUND('ride');
    
    // Cache the ride
    await this.cache.set(cacheKey, ride.toJSON(), CacheTTL.RIDE);
    
    // Get driver if assigned
    let driver = null;
    if (ride.driverId) {
      driver = await this.driverRepo.getById(ride.driverId, tenantId);
    }
    
    return { ride, driver };
  }

  /**
   * Get driver from cache or database
   */
  async getDriverFromCache(driverId, tenantId) {
    const cacheKey = CacheKeys.driver(tenantId, driverId);
    const cached = await this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const driver = await this.driverRepo.getById(driverId, tenantId);
    if (driver) {
      await this.cache.set(cacheKey, driver.toJSON(), CacheTTL.DRIVER);
    }
    
    return driver;
  }

  /**
   * Update ride status and invalidate cache
   */
  async updateRideStatus(id, tenantId, status) {
    await this.rideRepo.updateStatus(id, status);
    
    // Update cache
    const cacheKey = CacheKeys.ride(tenantId, id);
    const cached = await this.cache.get(cacheKey);
    
    if (cached) {
      cached.status = status;
      cached.updated_at = new Date().toISOString();
      await this.cache.set(cacheKey, cached, CacheTTL.RIDE);
    }
  }

  /**
   * Cancel a ride
   */
  async cancelRide(id, tenantId, reason) {
    const { ride } = await this.getRide(id, tenantId);
    
    if (ride.status === RideStatus.COMPLETED || ride.status === RideStatus.CANCELLED) {
      throw DomainErrors.INVALID_STATE_TRANSITION(ride.status, RideStatus.CANCELLED);
    }
    
    await this.rideRepo.cancel(id, reason);
    
    // Update driver status if assigned
    if (ride.driverId) {
      await this.driverRepo.updateStatus(ride.driverId, 'available');
      
      // Invalidate driver cache
      await this.cache.delete(CacheKeys.driver(tenantId, ride.driverId));
    }
    
    // Invalidate ride cache
    await this.cache.delete(CacheKeys.ride(tenantId, id));
  }

  /**
   * Get recent rides by rider with pagination
   */
  async getRecentRidesByRider(riderId, tenantId, limit = 10, offset = 0) {
    // For paginated queries, we skip cache and go directly to DB
    // as caching paginated results is complex and often not beneficial
    const rides = await this.rideRepo.getRidesByRider(riderId, tenantId, limit, offset);
    return rides;
  }

  /**
   * Batch update ride statuses
   */
  async batchUpdateStatus(rideIds, tenantId, status) {
    // Update all in database
    await Promise.all(rideIds.map(id => this.rideRepo.updateStatus(id, status)));
    
    // Invalidate all caches
    const cacheKeys = rideIds.map(id => CacheKeys.ride(tenantId, id));
    await this.cache.delete(...cacheKeys);
  }

  /**
   * Invalidate ride cache
   */
  async invalidateRideCache(rideId, tenantId) {
    await this.cache.delete(CacheKeys.ride(tenantId, rideId));
  }

  /**
   * Build ride response object
   */
  buildRideResponse(ride, driver = null) {
    const response = {
      id: ride.id,
      status: ride.status,
      vehicleType: ride.vehicleType,
      pickupLocation: ride.pickupLocation,
      dropoffLocation: ride.dropoffLocation,
      estimatedFare: ride.estimatedFare,
      requestedAt: ride.requestedAt,
      createdAt: ride.createdAt
    };
    
    if (driver) {
      response.driver = {
        id: driver.id,
        name: driver.name,
        vehicleNumber: driver.vehicleNumber,
        rating: driver.rating,
        currentLocation: driver.currentLocation
      };
    }
    
    return response;
  }

  // Metrics recording methods
  recordCacheHit(type) {
    if (this.metrics) {
      this.metrics.recordCacheHit(type);
    }
  }

  recordCacheMiss(type) {
    if (this.metrics) {
      this.metrics.recordCacheMiss(type);
    }
  }

  recordRideCreated(tenantId, vehicleType, durationMs) {
    if (this.metrics) {
      this.metrics.recordRideCreated(tenantId, vehicleType);
      this.metrics.recordDatabaseQuery('ride_create', durationMs);
    }
  }
}

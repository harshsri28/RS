// src/internal/services/cached_driver_service.js
import { v4 as uuidv4 } from 'uuid';
import { DomainErrors } from '../models/errors.js';
import { Driver, DriverStatus } from '../models/driver.js';
import { DriverLocationUpdatedEvent, Exchanges, EventTypes } from '../messaging/events.js';
import { CacheKeys, CacheTTL } from '../../pkg/cache/redis.js';

/**
 * CachedDriverService - Enhanced driver service with Redis caching
 * Extends the base DriverService with caching capabilities
 */
export class CachedDriverService {
  constructor(driverRepo, rideRepo, cache, rabbitMQ = null, metrics = null, temporalClient = null) {
    this.driverRepo = driverRepo;
    this.rideRepo = rideRepo;
    this.cache = cache;
    this.rabbitMQ = rabbitMQ;
    this.metrics = metrics;
    this.temporalClient = temporalClient;
  }

  /**
   * Create a new driver
   */
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
    
    // Cache the new driver
    const cacheKey = CacheKeys.driver(tenantId, driver.id);
    await this.cache.set(cacheKey, driver.toJSON(), CacheTTL.DRIVER);
    
    return driver;
  }

  /**
   * Get driver with caching
   */
  async getDriver(id, tenantId) {
    const cacheKey = CacheKeys.driver(tenantId, id);
    
    // Try cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.recordCacheHit('driver');
      return new Driver(cached);
    }
    
    this.recordCacheMiss('driver');
    
    // Fallback to database
    const driver = await this.driverRepo.getById(id, tenantId);
    if (!driver) throw DomainErrors.NOT_FOUND('driver');
    
    // Update cache
    await this.cache.set(cacheKey, driver.toJSON(), CacheTTL.DRIVER);
    
    return driver;
  }

  /**
   * Update driver location with Redis geo indexing
   * High-frequency operation optimized for performance
   */
  async updateLocation(id, tenantId, data) {
    const startTime = Date.now();
    
    // Update Redis geo index immediately (fast path)
    const geoKey = CacheKeys.driversGeo(tenantId);
    await this.cache.geoAdd(geoKey, data.longitude, data.latitude, id);
    
    // Update location cache
    const locationKey = CacheKeys.driverLocation(tenantId, id);
    await this.cache.set(locationKey, {
      latitude: data.latitude,
      longitude: data.longitude,
      updatedAt: new Date().toISOString()
    }, CacheTTL.DRIVER_LOCATION);
    
    // Publish to RabbitMQ for async DB update (don't block on this)
    if (this.rabbitMQ) {
      try {
        const event = new DriverLocationUpdatedEvent({
          driverId: id,
          tenantId: tenantId,
          latitude: data.latitude,
          longitude: data.longitude,
          status: data.status,
          timestamp: data.timestamp || new Date()
        });

        await this.rabbitMQ.publish(
          Exchanges.DRIVERS,
          EventTypes.DRIVER_LOCATION_UPDATED,
          event.toJSON()
        );
      } catch (publishError) {
        console.error('Failed to publish location event, syncing directly:', publishError);
        // Fallback to direct DB update
        await this.driverRepo.updateLocation(id, data.latitude, data.longitude);
      }
    } else {
      // Synchronous update when RabbitMQ not available
      await this.driverRepo.updateLocation(id, data.latitude, data.longitude);
    }
    
    // Record metrics
    this.recordLocationUpdate(Date.now() - startTime);
  }

  /**
   * Update driver availability status
   */
  async updateStatus(id, tenantId, status) {
    const driver = await this.getDriver(id, tenantId);
    
    // Validate state transition
    if (driver.status === DriverStatus.ON_TRIP && status !== DriverStatus.AVAILABLE) {
      throw DomainErrors.INVALID_STATE_TRANSITION(driver.status, status);
    }
    
    // Update database
    await this.driverRepo.updateStatus(id, status);
    
    // Update status cache
    const statusKey = CacheKeys.driverStatus(tenantId, id);
    await this.cache.set(statusKey, status, CacheTTL.DRIVER_STATUS);
    
    // Update geo index
    const geoKey = CacheKeys.driversGeo(tenantId);
    
    if (status === DriverStatus.AVAILABLE) {
      // Add to geo index if location is available
      if (driver.currentLocation) {
        await this.cache.geoAdd(
          geoKey,
          driver.currentLocation.longitude,
          driver.currentLocation.latitude,
          id
        );
      }
    } else {
      // Remove from available drivers geo index
      await this.cache.geoRemove(geoKey, id);
    }
    
    // Invalidate driver cache
    await this.cache.delete(CacheKeys.driver(tenantId, id));
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

  /**
   * Accept a ride request
   */
  async acceptRide(id, tenantId, data) {
    const driver = await this.getDriver(id, tenantId);
    
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
      console.log('Workflow signal failed, attempting direct assignment');
      
      // Use optimistic locking for ride assignment
      const assigned = await this.rideRepo.assignDriverWithLock(data.ride_id, id);
      if (!assigned) {
        throw new Error('Ride already assigned to another driver');
      }
      
      // Update driver status
      await this.updateStatus(id, tenantId, DriverStatus.BUSY);
      
      // Invalidate ride cache
      await this.cache.delete(CacheKeys.ride(tenantId, data.ride_id));
    }
    
    return true;
  }

  /**
   * Decline a ride offer
   */
  async declineRide(id, tenantId, data) {
    const driver = await this.getDriver(id, tenantId);
    if (!driver) throw DomainErrors.NOT_FOUND('driver');

    const ride = await this.rideRepo.getById(data.ride_id, tenantId);
    if (!ride) throw DomainErrors.NOT_FOUND('ride');

    // Signal the Temporal workflow that this driver declined
    await this.signalDriverResponse(data.ride_id, id, false);
  }

  /**
   * Find available drivers nearby using geo search
   */
  async findNearbyDrivers(tenantId, lat, lng, radiusKm, vehicleType, limit = 10) {
    const startTime = Date.now();
    
    // Use geo radius search
    const geoKey = CacheKeys.driversGeo(tenantId);
    
    try {
      const nearbyResults = await this.cache.geoRadius(
        geoKey, lng, lat, radiusKm,
        { count: limit * 3, sort: 'ASC', withDist: true }
      );
      
      if (nearbyResults.length === 0) {
        // Fallback to database search
        return await this.driverRepo.findAvailableDrivers(
          tenantId, lat, lng, radiusKm, vehicleType, limit
        );
      }
      
      // Get driver details and filter
      const driverIds = nearbyResults.map(r => r.member);
      const drivers = await this.getDriversByIds(driverIds, tenantId);
      
      // Filter by vehicle type and availability
      const filtered = drivers
        .filter(d => d.vehicleType === vehicleType && d.status === DriverStatus.AVAILABLE)
        .slice(0, limit);
      
      // Add distance information
      const distanceMap = new Map(nearbyResults.map(r => [r.member, r.distance]));
      const result = filtered.map(d => ({
        ...d.toJSON(),
        distance: distanceMap.get(d.id)
      }));
      
      // Record metrics
      this.recordDriverMatching(data?.ride_id || 'unknown', Date.now() - startTime, result.length);
      
      return result;
    } catch (error) {
      console.error('Geo search failed:', error);
      return await this.driverRepo.findAvailableDrivers(
        tenantId, lat, lng, radiusKm, vehicleType, limit
      );
    }
  }

  /**
   * Get multiple drivers by IDs with batch caching
   */
  async getDriversByIds(driverIds, tenantId) {
    if (driverIds.length === 0) return [];
    
    const cacheKeys = driverIds.map(id => CacheKeys.driver(tenantId, id));
    const cached = await this.cache.mget(cacheKeys);
    
    const drivers = [];
    const missedIds = [];
    
    driverIds.forEach((id, index) => {
      const key = cacheKeys[index];
      const data = cached.get(key);
      
      if (data) {
        drivers.push(new Driver(data));
      } else {
        missedIds.push(id);
      }
    });
    
    // Fetch missing from database
    if (missedIds.length > 0) {
      const dbDrivers = await this.fetchDriversFromDb(missedIds, tenantId);
      
      // Cache and add to result
      const toCache = new Map();
      for (const driver of dbDrivers) {
        toCache.set(CacheKeys.driver(tenantId, driver.id), driver.toJSON());
        drivers.push(driver);
      }
      
      if (toCache.size > 0) {
        await this.cache.mset(toCache, CacheTTL.DRIVER);
      }
    }
    
    return drivers;
  }

  /**
   * Fetch drivers from database by IDs
   */
  async fetchDriversFromDb(driverIds, tenantId) {
    // This would use the repository's db connection directly
    return await this.driverRepo.getDriversByIds?.(driverIds, tenantId) || [];
  }

  /**
   * Check multiple drivers availability concurrently
   */
  async checkMultipleDriversAvailability(driverIds, tenantId) {
    const results = new Map();
    
    // Parallel availability checks using Promise.all
    await Promise.all(driverIds.map(async (driverId) => {
      try {
        const statusKey = CacheKeys.driverStatus(tenantId, driverId);
        const status = await this.cache.get(statusKey);
        
        if (status !== null) {
          results.set(driverId, status === DriverStatus.AVAILABLE);
        } else {
          // Fallback to database
          const driver = await this.driverRepo.getById(driverId, tenantId);
          results.set(driverId, driver?.status === DriverStatus.AVAILABLE);
        }
      } catch (error) {
        results.set(driverId, false);
      }
    }));
    
    return results;
  }

  /**
   * Invalidate all driver caches
   */
  async invalidateDriverCache(driverId, tenantId) {
    await this.cache.delete(
      CacheKeys.driver(tenantId, driverId),
      CacheKeys.driverLocation(tenantId, driverId),
      CacheKeys.driverStatus(tenantId, driverId)
    );
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

  recordLocationUpdate(durationMs) {
    if (this.metrics) {
      this.metrics.recordDatabaseQuery('location_update', durationMs);
    }
  }

  recordDriverMatching(rideId, durationMs, driversFound) {
    if (this.metrics) {
      this.metrics.recordDriverMatching(rideId, durationMs, driversFound);
    }
  }
}

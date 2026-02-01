// src/internal/repository/cached_driver_repository.js
import { Driver } from '../models/driver.js';
import { CacheKeys, CacheTTL } from '../../pkg/cache/redis.js';

/**
 * CachedDriverRepository - Driver repository with Redis caching and geospatial indexing
 * Wraps the base DriverRepository to add caching functionality
 */
export class CachedDriverRepository {
  constructor(driverRepo, cache, metrics = null) {
    this.driverRepo = driverRepo;
    this.cache = cache;
    this.metrics = metrics;
    this.db = driverRepo.db;
  }

  /**
   * Create a new driver and update cache
   */
  async create(driver) {
    await this.driverRepo.create(driver);
    
    // Cache the new driver
    const cacheKey = CacheKeys.driver(driver.tenantId, driver.id);
    await this.cache.set(cacheKey, driver.toJSON(), CacheTTL.DRIVER);
  }

  /**
   * Get driver by ID with caching
   */
  async getById(id, tenantId) {
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
    if (driver) {
      await this.cache.set(cacheKey, driver.toJSON(), CacheTTL.DRIVER);
    }
    
    return driver;
  }

  /**
   * Update driver and invalidate cache
   */
  async update(driver) {
    await this.driverRepo.update(driver);
    
    // Invalidate cache
    const cacheKey = CacheKeys.driver(driver.tenantId, driver.id);
    await this.cache.delete(cacheKey);
  }

  /**
   * Update driver status and sync with geo index
   */
  async updateStatus(id, status, tenantId = null) {
    await this.driverRepo.updateStatus(id, status);
    
    // Update status cache
    if (tenantId) {
      const statusKey = CacheKeys.driverStatus(tenantId, id);
      await this.cache.set(statusKey, status, CacheTTL.DRIVER_STATUS);
      
      // Update geo index based on status
      const geoKey = CacheKeys.driversGeo(tenantId);
      
      if (status === 'available') {
        // Fetch location and add to geo index
        const driver = await this.driverRepo.getById(id, tenantId);
        if (driver && driver.currentLocation) {
          await this.cache.geoAdd(
            geoKey,
            driver.currentLocation.longitude,
            driver.currentLocation.latitude,
            id
          );
        }
      } else {
        // Remove from geo index
        await this.cache.geoRemove(geoKey, id);
      }
      
      // Invalidate driver cache
      await this.cache.delete(CacheKeys.driver(tenantId, id));
    }
  }

  /**
   * Update driver location with Redis geo indexing
   */
  async updateLocation(id, lat, lng, tenantId = null) {
    // Update database asynchronously if needed
    await this.driverRepo.updateLocation(id, lat, lng);
    
    if (tenantId) {
      // Update location cache
      const locationKey = CacheKeys.driverLocation(tenantId, id);
      await this.cache.set(locationKey, {
        latitude: lat,
        longitude: lng,
        updatedAt: new Date().toISOString()
      }, CacheTTL.DRIVER_LOCATION);
      
      // Update geo index for available drivers
      const geoKey = CacheKeys.driversGeo(tenantId);
      await this.cache.geoAdd(geoKey, lng, lat, id);
    }
  }

  /**
   * Find available drivers nearby using Redis geo index
   * Falls back to database if cache is empty
   */
  async findAvailableDrivers(tenantId, lat, lng, radiusKm, vehicleType, limit = 10) {
    const geoKey = CacheKeys.driversGeo(tenantId);
    
    try {
      // Step 1: Query Redis geo index for nearby drivers
      const nearbyResults = await this.cache.geoRadius(
        geoKey,
        lng, lat,
        radiusKm,
        { count: limit * 3, sort: 'ASC', withDist: true } // Get extra to filter by vehicle type
      );
      
      if (nearbyResults.length > 0) {
        this.recordCacheHit('geo');
        
        // Step 2: Get driver details from cache or database
        const driverIds = nearbyResults.map(r => r.member);
        const drivers = await this.getDriversByIds(driverIds, tenantId, vehicleType);
        
        // Filter by vehicle type and status, then limit
        const filtered = drivers
          .filter(d => d.vehicleType === vehicleType && d.status === 'available')
          .slice(0, limit);
        
        if (filtered.length > 0) {
          // Add distance info
          const distanceMap = new Map(nearbyResults.map(r => [r.member, r.distance]));
          return filtered.map(d => ({
            ...d,
            distance: distanceMap.get(d.id) || null
          }));
        }
      }
    } catch (cacheError) {
      console.error('Cache geo search failed:', cacheError);
    }
    
    this.recordCacheMiss('geo');
    
    // Fallback to database query
    return await this.driverRepo.findAvailableDrivers(tenantId, lat, lng, radiusKm, vehicleType, limit);
  }

  /**
   * Get multiple drivers by IDs with batch caching
   */
  async getDriversByIds(driverIds, tenantId, vehicleType = null) {
    if (driverIds.length === 0) return [];
    
    // Build cache keys
    const cacheKeys = driverIds.map(id => CacheKeys.driver(tenantId, id));
    
    // Try to get from cache
    const cached = await this.cache.mget(cacheKeys);
    
    const drivers = [];
    const missedIds = [];
    
    driverIds.forEach((id, index) => {
      const key = cacheKeys[index];
      const data = cached.get(key);
      
      if (data) {
        drivers.push(new Driver(data));
        this.recordCacheHit('driver_batch');
      } else {
        missedIds.push(id);
        this.recordCacheMiss('driver_batch');
      }
    });
    
    // Fetch missed drivers from database
    if (missedIds.length > 0) {
      const dbDrivers = await this.fetchDriversByIdsFromDb(missedIds, tenantId);
      
      // Cache the fetched drivers
      const toCache = new Map();
      for (const driver of dbDrivers) {
        const key = CacheKeys.driver(tenantId, driver.id);
        toCache.set(key, driver.toJSON());
        drivers.push(driver);
      }
      
      if (toCache.size > 0) {
        await this.cache.mset(toCache, CacheTTL.DRIVER);
      }
    }
    
    return drivers;
  }

  /**
   * Fetch drivers by IDs from database (batch query)
   */
  async fetchDriversByIdsFromDb(driverIds, tenantId) {
    const rows = await this.db('drivers')
      .whereIn('id', driverIds)
      .andWhere({ tenant_id: tenantId });
    
    return rows.map(row => new Driver(row));
  }

  /**
   * Increment trip count and invalidate cache
   */
  async incrementTripCount(id, tenantId = null) {
    await this.driverRepo.incrementTripCount(id);
    
    if (tenantId) {
      await this.cache.delete(CacheKeys.driver(tenantId, id));
    }
  }

  /**
   * Get available driver count (optimized query)
   */
  async getAvailableDriverCount(tenantId, vehicleType) {
    const result = await this.db('drivers')
      .count('* as count')
      .where({
        tenant_id: tenantId,
        vehicle_type: vehicleType,
        status: 'available'
      })
      .first();
    
    return parseInt(result?.count || 0);
  }

  /**
   * Sync driver to geo index (used during startup or recovery)
   */
  async syncDriverToGeoIndex(driver) {
    if (driver.status === 'available' && driver.currentLocation) {
      const geoKey = CacheKeys.driversGeo(driver.tenantId);
      await this.cache.geoAdd(
        geoKey,
        driver.currentLocation.longitude,
        driver.currentLocation.latitude,
        driver.id
      );
    }
  }

  /**
   * Bulk sync all available drivers to geo index
   */
  async syncAllDriversToGeoIndex(tenantId) {
    const drivers = await this.db('drivers')
      .where({
        tenant_id: tenantId,
        status: 'available'
      })
      .whereNotNull('current_latitude')
      .whereNotNull('current_longitude');
    
    const geoKey = CacheKeys.driversGeo(tenantId);
    
    // Add all drivers to geo index in batches
    const locations = drivers.map(d => ({
      longitude: d.current_longitude,
      latitude: d.current_latitude,
      member: d.id
    }));
    
    if (locations.length > 0) {
      await this.cache.geoAddMultiple(geoKey, locations);
    }
    
    return locations.length;
  }

  /**
   * Remove driver from geo index
   */
  async removeFromGeoIndex(driverId, tenantId) {
    const geoKey = CacheKeys.driversGeo(tenantId);
    await this.cache.geoRemove(geoKey, driverId);
  }

  /**
   * Invalidate all caches for a driver
   */
  async invalidateDriverCache(driverId, tenantId) {
    await this.cache.delete(
      CacheKeys.driver(tenantId, driverId),
      CacheKeys.driverLocation(tenantId, driverId),
      CacheKeys.driverStatus(tenantId, driverId)
    );
  }

  // Metrics helpers
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
}

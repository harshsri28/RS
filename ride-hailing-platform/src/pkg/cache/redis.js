// src/pkg/cache/redis.js
import Redis from 'ioredis';

/**
 * RedisCache - Unified cache layer with support for key-value, geospatial, and set operations
 */
export class RedisCache {
  constructor(client) {
    this.client = client;
  }

  /**
   * Create a new RedisCache instance
   * @param {Object} options - Redis connection options
   * @param {string} options.host - Redis host
   * @param {number} options.port - Redis port
   * @param {string} [options.password] - Redis password
   * @param {number} [options.db] - Redis database number
   * @param {number} [options.maxRetriesPerRequest] - Max retries per request
   * @returns {Promise<RedisCache>}
   */
  static async create(options) {
    const client = new Redis({
      host: options.host,
      port: options.port,
      password: options.password || undefined,
      db: options.db || 0,
      maxRetriesPerRequest: options.maxRetriesPerRequest || 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      lazyConnect: true,
      // Connection pool settings
      family: 4,
      keepAlive: 10000,
      connectTimeout: 10000,
    });

    // Connect and verify
    await client.connect();
    await client.ping();

    return new RedisCache(client);
  }

  // ========== Key-Value Operations ==========

  /**
   * Set a value with optional TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to store (will be JSON serialized)
   * @param {number} [ttlSeconds] - Time to live in seconds
   */
  async set(key, value, ttlSeconds = null) {
    const data = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, data);
    } else {
      await this.client.set(key, data);
    }
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<*>} Parsed value or null if not found
   */
  async get(key) {
    const data = await this.client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  /**
   * Delete one or more keys
   * @param {...string} keys - Keys to delete
   * @returns {Promise<number>} Number of keys deleted
   */
  async delete(...keys) {
    if (keys.length === 0) return 0;
    return await this.client.del(...keys);
  }

  /**
   * Check if a key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    const count = await this.client.exists(key);
    return count > 0;
  }

  /**
   * Get multiple values at once
   * @param {string[]} keys - Array of keys
   * @returns {Promise<Map<string, *>>} Map of key to value
   */
  async mget(keys) {
    if (keys.length === 0) return new Map();
    const values = await this.client.mget(...keys);
    const result = new Map();
    keys.forEach((key, index) => {
      if (values[index]) {
        try {
          result.set(key, JSON.parse(values[index]));
        } catch {
          result.set(key, values[index]);
        }
      }
    });
    return result;
  }

  /**
   * Set multiple values at once
   * @param {Map<string, *>} keyValues - Map of key-value pairs
   * @param {number} [ttlSeconds] - TTL for all keys
   */
  async mset(keyValues, ttlSeconds = null) {
    const pipeline = this.client.pipeline();
    for (const [key, value] of keyValues) {
      const data = JSON.stringify(value);
      if (ttlSeconds) {
        pipeline.setex(key, ttlSeconds, data);
      } else {
        pipeline.set(key, data);
      }
    }
    await pipeline.exec();
  }

  /**
   * Set TTL on an existing key
   * @param {string} key - Cache key
   * @param {number} ttlSeconds - Time to live in seconds
   */
  async expire(key, ttlSeconds) {
    await this.client.expire(key, ttlSeconds);
  }

  // ========== Geospatial Operations ==========

  /**
   * Add a member to a geospatial index
   * @param {string} key - Geo index key
   * @param {number} longitude - Longitude coordinate
   * @param {number} latitude - Latitude coordinate
   * @param {string} member - Member identifier
   */
  async geoAdd(key, longitude, latitude, member) {
    await this.client.geoadd(key, longitude, latitude, member);
  }

  /**
   * Add multiple members to a geospatial index
   * @param {string} key - Geo index key
   * @param {Array<{longitude: number, latitude: number, member: string}>} locations
   */
  async geoAddMultiple(key, locations) {
    if (locations.length === 0) return;
    const args = locations.flatMap(loc => [loc.longitude, loc.latitude, loc.member]);
    await this.client.geoadd(key, ...args);
  }

  /**
   * Find members within a radius of a point
   * @param {string} key - Geo index key
   * @param {number} longitude - Center longitude
   * @param {number} latitude - Center latitude
   * @param {number} radiusKm - Radius in kilometers
   * @param {Object} [options] - Additional options
   * @param {number} [options.count] - Maximum number of results
   * @param {string} [options.sort] - Sort order ('ASC' or 'DESC')
   * @param {boolean} [options.withDist] - Include distance in results
   * @returns {Promise<Array<{member: string, distance?: number}>>}
   */
  async geoRadius(key, longitude, latitude, radiusKm, options = {}) {
    const args = [key, longitude, latitude, radiusKm, 'km'];
    
    if (options.withDist) {
      args.push('WITHDIST');
    }
    
    if (options.sort) {
      args.push(options.sort);
    }
    
    if (options.count) {
      args.push('COUNT', options.count);
    }
    
    const results = await this.client.georadius(...args);
    
    if (options.withDist) {
      return results.map(item => ({
        member: item[0],
        distance: parseFloat(item[1])
      }));
    }
    
    return results.map(member => ({ member }));
  }

  /**
   * Get the position of a member
   * @param {string} key - Geo index key
   * @param {string} member - Member identifier
   * @returns {Promise<{longitude: number, latitude: number} | null>}
   */
  async geoPos(key, member) {
    const result = await this.client.geopos(key, member);
    if (!result || !result[0]) return null;
    return {
      longitude: parseFloat(result[0][0]),
      latitude: parseFloat(result[0][1])
    };
  }

  /**
   * Remove members from a geospatial index
   * @param {string} key - Geo index key
   * @param {...string} members - Members to remove
   */
  async geoRemove(key, ...members) {
    if (members.length === 0) return;
    await this.client.zrem(key, ...members);
  }

  /**
   * Get distance between two members
   * @param {string} key - Geo index key
   * @param {string} member1 - First member
   * @param {string} member2 - Second member
   * @param {string} [unit='km'] - Unit (m, km, mi, ft)
   * @returns {Promise<number | null>}
   */
  async geoDist(key, member1, member2, unit = 'km') {
    const result = await this.client.geodist(key, member1, member2, unit);
    return result ? parseFloat(result) : null;
  }

  // ========== Set Operations ==========

  /**
   * Add members to a set
   * @param {string} key - Set key
   * @param {...*} members - Members to add
   */
  async sAdd(key, ...members) {
    if (members.length === 0) return;
    await this.client.sadd(key, ...members);
  }

  /**
   * Remove members from a set
   * @param {string} key - Set key
   * @param {...*} members - Members to remove
   */
  async sRem(key, ...members) {
    if (members.length === 0) return;
    await this.client.srem(key, ...members);
  }

  /**
   * Check if a member is in a set
   * @param {string} key - Set key
   * @param {*} member - Member to check
   * @returns {Promise<boolean>}
   */
  async sIsMember(key, member) {
    const result = await this.client.sismember(key, member);
    return result === 1;
  }

  /**
   * Get all members of a set
   * @param {string} key - Set key
   * @returns {Promise<string[]>}
   */
  async sMembers(key) {
    return await this.client.smembers(key);
  }

  /**
   * Get the number of members in a set
   * @param {string} key - Set key
   * @returns {Promise<number>}
   */
  async sCard(key) {
    return await this.client.scard(key);
  }

  // ========== Hash Operations ==========

  /**
   * Set a field in a hash
   * @param {string} key - Hash key
   * @param {string} field - Field name
   * @param {*} value - Value to store
   */
  async hSet(key, field, value) {
    await this.client.hset(key, field, JSON.stringify(value));
  }

  /**
   * Get a field from a hash
   * @param {string} key - Hash key
   * @param {string} field - Field name
   * @returns {Promise<*>}
   */
  async hGet(key, field) {
    const data = await this.client.hget(key, field);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  /**
   * Get all fields from a hash
   * @param {string} key - Hash key
   * @returns {Promise<Object>}
   */
  async hGetAll(key) {
    const data = await this.client.hgetall(key);
    const result = {};
    for (const [field, value] of Object.entries(data)) {
      try {
        result[field] = JSON.parse(value);
      } catch {
        result[field] = value;
      }
    }
    return result;
  }

  /**
   * Delete fields from a hash
   * @param {string} key - Hash key
   * @param {...string} fields - Fields to delete
   */
  async hDel(key, ...fields) {
    if (fields.length === 0) return;
    await this.client.hdel(key, ...fields);
  }

  // ========== Increment/Counter Operations ==========

  /**
   * Increment a counter
   * @param {string} key - Counter key
   * @param {number} [amount=1] - Amount to increment
   * @returns {Promise<number>} New value
   */
  async incr(key, amount = 1) {
    if (amount === 1) {
      return await this.client.incr(key);
    }
    return await this.client.incrby(key, amount);
  }

  /**
   * Decrement a counter
   * @param {string} key - Counter key
   * @param {number} [amount=1] - Amount to decrement
   * @returns {Promise<number>} New value
   */
  async decr(key, amount = 1) {
    if (amount === 1) {
      return await this.client.decr(key);
    }
    return await this.client.decrby(key, amount);
  }

  // ========== Utility Methods ==========

  /**
   * Get raw Redis client for advanced operations
   * @returns {Redis}
   */
  getClient() {
    return this.client;
  }

  /**
   * Execute a pipeline of commands
   * @param {Function} callback - Function that receives pipeline and adds commands
   * @returns {Promise<Array>}
   */
  async pipeline(callback) {
    const pipeline = this.client.pipeline();
    callback(pipeline);
    return await pipeline.exec();
  }

  /**
   * Flush all keys (use with caution!)
   */
  async flushAll() {
    await this.client.flushall();
  }

  /**
   * Close the Redis connection
   */
  async close() {
    await this.client.quit();
  }

  /**
   * Check if connection is ready
   * @returns {boolean}
   */
  isReady() {
    return this.client.status === 'ready';
  }
}

/**
 * Factory function to create RedisCache
 * @param {Object} config - Redis configuration
 * @returns {Promise<RedisCache>}
 */
export async function createRedisCache(config) {
  return await RedisCache.create(config);
}

// Cache key generators for consistency
export const CacheKeys = {
  driver: (tenantId, driverId) => `driver:${tenantId}:${driverId}`,
  driverLocation: (tenantId, driverId) => `driver:${tenantId}:${driverId}:location`,
  driverStatus: (tenantId, driverId) => `driver:${tenantId}:${driverId}:status`,
  driversGeo: (tenantId) => `drivers:geo:${tenantId}:available`,
  ride: (tenantId, rideId) => `ride:${tenantId}:${rideId}`,
  rideStatus: (tenantId, rideId) => `ride:${tenantId}:${rideId}:status`,
  user: (tenantId, userId) => `user:${tenantId}:${userId}`,
  availableDriversSet: (tenantId, vehicleType) => `drivers:available:${tenantId}:${vehicleType}`,
};

// Default TTL values (in seconds)
export const CacheTTL = {
  DRIVER: 300,           // 5 minutes
  DRIVER_LOCATION: 60,   // 1 minute  
  DRIVER_STATUS: 600,    // 10 minutes
  RIDE: 300,             // 5 minutes
  USER: 600,             // 10 minutes
  SHORT: 60,             // 1 minute
  MEDIUM: 300,           // 5 minutes
  LONG: 3600,            // 1 hour
};

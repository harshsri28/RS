// src/internal/services/concurrent_operations.js
/**
 * Concurrent operation helpers for Phase 3 performance optimization
 * Provides utilities for parallel processing and batch operations
 */

/**
 * Execute multiple async operations in parallel with concurrency limit
 * @param {Array} items - Items to process
 * @param {Function} operation - Async function to apply to each item
 * @param {number} concurrency - Maximum concurrent operations
 * @returns {Promise<Array>} Results from all operations
 */
export async function parallelWithLimit(items, operation, concurrency = 10) {
  const results = [];
  const executing = new Set();
  
  for (const item of items) {
    const promise = Promise.resolve().then(() => operation(item));
    results.push(promise);
    executing.add(promise);
    
    const cleanup = () => executing.delete(promise);
    promise.then(cleanup).catch(cleanup);
    
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  
  return Promise.all(results);
}

/**
 * Batch processor for large datasets
 * @param {Array} items - Items to process
 * @param {number} batchSize - Size of each batch
 * @param {Function} processor - Async function to process each batch
 * @returns {Promise<Array>} Combined results from all batches
 */
export async function processBatches(items, batchSize, processor) {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...(Array.isArray(batchResults) ? batchResults : [batchResults]));
  }
  
  return results;
}

/**
 * Retry wrapper with exponential backoff
 * @param {Function} operation - Async operation to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Result from successful operation
 */
export async function withRetry(operation, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 100,
    maxDelay = 5000,
    shouldRetry = () => true
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Cache-aside pattern helper
 * @param {Object} cache - Cache instance
 * @param {string} key - Cache key
 * @param {Function} fetcher - Async function to fetch data if cache miss
 * @param {number} ttl - Cache TTL in seconds
 * @returns {Promise} Cached or fetched data
 */
export async function cacheAside(cache, key, fetcher, ttl = 300) {
  // Try cache first
  const cached = await cache.get(key);
  if (cached !== null) {
    return cached;
  }
  
  // Fetch from source
  const data = await fetcher();
  
  // Store in cache
  if (data !== null && data !== undefined) {
    await cache.set(key, data, ttl);
  }
  
  return data;
}

/**
 * Concurrent availability checker for drivers
 */
export class ConcurrentDriverChecker {
  constructor(driverRepo, cache) {
    this.driverRepo = driverRepo;
    this.cache = cache;
  }

  /**
   * Check multiple drivers' availability concurrently
   * @param {Array<string>} driverIds - List of driver IDs
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Map<string, boolean>>} Map of driver ID to availability
   */
  async checkAvailability(driverIds, tenantId) {
    const results = new Map();
    
    await Promise.all(driverIds.map(async (driverId) => {
      try {
        // Check cache first
        const statusKey = `driver:${tenantId}:${driverId}:status`;
        const cachedStatus = await this.cache.get(statusKey);
        
        if (cachedStatus !== null) {
          results.set(driverId, cachedStatus === 'available');
          return;
        }
        
        // Fallback to database
        const driver = await this.driverRepo.getById(driverId, tenantId);
        results.set(driverId, driver?.status === 'available');
        
        // Cache the result
        if (driver) {
          await this.cache.set(statusKey, driver.status, 600);
        }
      } catch (error) {
        results.set(driverId, false);
      }
    }));
    
    return results;
  }

  /**
   * Find first available driver from list
   * @param {Array<string>} driverIds - Ordered list of driver IDs
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<string|null>} First available driver ID or null
   */
  async findFirstAvailable(driverIds, tenantId) {
    // Check in parallel batches
    const batchSize = 5;
    
    for (let i = 0; i < driverIds.length; i += batchSize) {
      const batch = driverIds.slice(i, i + batchSize);
      const availability = await this.checkAvailability(batch, tenantId);
      
      for (const driverId of batch) {
        if (availability.get(driverId)) {
          return driverId;
        }
      }
    }
    
    return null;
  }
}

/**
 * Parallel geo searcher for finding nearby entities
 */
export class ParallelGeoSearcher {
  constructor(cache) {
    this.cache = cache;
  }

  /**
   * Search multiple geo areas in parallel
   * @param {Array<Object>} searchAreas - List of {key, lat, lng, radius}
   * @returns {Promise<Map<string, Array>>} Results by area key
   */
  async searchMultipleAreas(searchAreas) {
    const results = new Map();
    
    await Promise.all(searchAreas.map(async (area) => {
      try {
        const nearby = await this.cache.geoRadius(
          area.key,
          area.lng,
          area.lat,
          area.radius,
          { count: area.count || 50, sort: 'ASC', withDist: true }
        );
        results.set(area.key, nearby);
      } catch (error) {
        results.set(area.key, []);
      }
    }));
    
    return results;
  }
}

/**
 * Aggregation helper for batch operations
 */
export class BatchAggregator {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 1000;
    this.processor = options.processor;
    this.buffer = [];
    this.timer = null;
  }

  /**
   * Add item to batch
   * @param {*} item - Item to add
   */
  async add(item) {
    this.buffer.push(item);
    
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  /**
   * Force flush all buffered items
   */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    if (this.buffer.length === 0) return;
    
    const items = this.buffer;
    this.buffer = [];
    
    if (this.processor) {
      await this.processor(items);
    }
  }

  /**
   * Stop aggregator and flush remaining items
   */
  async stop() {
    await this.flush();
  }
}

/**
 * Circuit breaker for external service calls
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.lastFailureTime = null;
  }

  /**
   * Execute operation with circuit breaker protection
   * @param {Function} operation - Async operation to execute
   * @returns {Promise} Result or throws error
   */
  async execute(operation) {
    if (this.state === 'OPEN') {
      // Check if we should try again
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return this.state;
  }
}

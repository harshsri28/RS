// src/internal/metrics/metrics.js
/**
 * MetricsCollector - Custom metrics collection for monitoring
 * Uses prom-client for Prometheus-compatible metrics
 */

import client from 'prom-client';

export class MetricsCollector {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.prefix = options.prefix || 'ridehailing_';
    
    if (!this.enabled) return;
    
    // Initialize default metrics
    client.collectDefaultMetrics({
      prefix: this.prefix,
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
    });
    
    // Custom counters
    this.rideCreatedCounter = new client.Counter({
      name: `${this.prefix}rides_created_total`,
      help: 'Total number of rides created',
      labelNames: ['tenant_id', 'vehicle_type']
    });
    
    this.cacheHitCounter = new client.Counter({
      name: `${this.prefix}cache_hits_total`,
      help: 'Total cache hits',
      labelNames: ['cache_type']
    });
    
    this.cacheMissCounter = new client.Counter({
      name: `${this.prefix}cache_misses_total`,
      help: 'Total cache misses',
      labelNames: ['cache_type']
    });
    
    this.driverLocationUpdatesCounter = new client.Counter({
      name: `${this.prefix}driver_location_updates_total`,
      help: 'Total driver location updates'
    });
    
    this.rideMatchingCounter = new client.Counter({
      name: `${this.prefix}ride_matching_attempts_total`,
      help: 'Total ride matching attempts',
      labelNames: ['success']
    });
    
    // Histograms for latency tracking
    this.httpRequestDuration = new client.Histogram({
      name: `${this.prefix}http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    });
    
    this.databaseQueryDuration = new client.Histogram({
      name: `${this.prefix}database_query_duration_seconds`,
      help: 'Database query duration in seconds',
      labelNames: ['query_name'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1]
    });
    
    this.driverMatchingDuration = new client.Histogram({
      name: `${this.prefix}driver_matching_duration_seconds`,
      help: 'Driver matching duration in seconds',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
    });
    
    this.cacheOperationDuration = new client.Histogram({
      name: `${this.prefix}cache_operation_duration_seconds`,
      help: 'Cache operation duration in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1]
    });
    
    // Gauges for current state
    this.activeRidesGauge = new client.Gauge({
      name: `${this.prefix}active_rides`,
      help: 'Current number of active rides',
      labelNames: ['tenant_id', 'status']
    });
    
    this.availableDriversGauge = new client.Gauge({
      name: `${this.prefix}available_drivers`,
      help: 'Current number of available drivers',
      labelNames: ['tenant_id', 'vehicle_type']
    });
    
    this.driversFoundGauge = new client.Gauge({
      name: `${this.prefix}drivers_found_in_matching`,
      help: 'Number of drivers found in last matching operation'
    });
  }

  // ========== Counter Methods ==========

  recordRideCreated(tenantId, vehicleType) {
    if (!this.enabled) return;
    this.rideCreatedCounter.labels(tenantId, vehicleType).inc();
  }

  recordCacheHit(cacheType) {
    if (!this.enabled) return;
    this.cacheHitCounter.labels(cacheType).inc();
  }

  recordCacheMiss(cacheType) {
    if (!this.enabled) return;
    this.cacheMissCounter.labels(cacheType).inc();
  }

  recordLocationUpdate() {
    if (!this.enabled) return;
    this.driverLocationUpdatesCounter.inc();
  }

  recordMatchingAttempt(success) {
    if (!this.enabled) return;
    this.rideMatchingCounter.labels(success ? 'true' : 'false').inc();
  }

  // ========== Histogram Methods ==========

  recordHttpRequest(method, route, statusCode, durationSeconds) {
    if (!this.enabled) return;
    this.httpRequestDuration.labels(method, route, String(statusCode)).observe(durationSeconds);
  }

  recordDatabaseQuery(queryName, durationMs) {
    if (!this.enabled) return;
    this.databaseQueryDuration.labels(queryName).observe(durationMs / 1000);
  }

  recordDriverMatching(rideId, durationMs, driversFound) {
    if (!this.enabled) return;
    this.driverMatchingDuration.observe(durationMs / 1000);
    this.driversFoundGauge.set(driversFound);
    this.recordMatchingAttempt(driversFound > 0);
  }

  recordCacheOperation(operation, durationMs) {
    if (!this.enabled) return;
    this.cacheOperationDuration.labels(operation).observe(durationMs / 1000);
  }

  // ========== Gauge Methods ==========

  setActiveRides(tenantId, status, count) {
    if (!this.enabled) return;
    this.activeRidesGauge.labels(tenantId, status).set(count);
  }

  setAvailableDrivers(tenantId, vehicleType, count) {
    if (!this.enabled) return;
    this.availableDriversGauge.labels(tenantId, vehicleType).set(count);
  }

  // ========== Utility Methods ==========

  /**
   * Start a timer for measuring duration
   * @returns {Function} Call to get duration in seconds
   */
  startTimer() {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1e9; // Convert to seconds
    };
  }

  /**
   * Get all metrics as string
   */
  async getMetrics() {
    if (!this.enabled) return '';
    return await client.register.metrics();
  }

  /**
   * Get content type for metrics
   */
  getContentType() {
    return client.register.contentType;
  }

  /**
   * Reset all metrics
   */
  reset() {
    if (!this.enabled) return;
    client.register.resetMetrics();
  }

  /**
   * Get registry for custom operations
   */
  getRegistry() {
    return client.register;
  }
}

/**
 * Express middleware for tracking HTTP request metrics
 */
export function metricsMiddleware(metrics) {
  return (req, res, next) => {
    if (!metrics.enabled) {
      return next();
    }
    
    const startTime = metrics.startTimer();
    
    // Capture the original end method
    const originalEnd = res.end;
    
    res.end = function(...args) {
      const duration = startTime();
      
      // Normalize route path (remove IDs)
      let route = req.route?.path || req.path || 'unknown';
      route = route.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
      route = route.replace(/\/\d+/g, '/:id');
      
      metrics.recordHttpRequest(req.method, route, res.statusCode, duration);
      
      originalEnd.apply(res, args);
    };
    
    next();
  };
}

/**
 * Express handler for metrics endpoint
 */
export function metricsHandler(metrics) {
  return async (req, res) => {
    try {
      const metricsData = await metrics.getMetrics();
      res.set('Content-Type', metrics.getContentType());
      res.send(metricsData);
    } catch (error) {
      res.status(500).send('Error collecting metrics');
    }
  };
}

/**
 * Create metrics collector instance
 */
export function createMetrics(options = {}) {
  return new MetricsCollector(options);
}

// Singleton instance for convenience
let defaultMetrics = null;

export function getDefaultMetrics() {
  if (!defaultMetrics) {
    defaultMetrics = new MetricsCollector({ enabled: true });
  }
  return defaultMetrics;
}

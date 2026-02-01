// src/internal/config/config.js
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  server: {
    port: process.env.SERVER_PORT || 8080,
    host: process.env.SERVER_HOST || '0.0.0.0'
  },
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'ridehail',
    password: process.env.DB_PASSWORD || 'ridehail123',
    database: process.env.DB_NAME || 'ridehail',
    // Enhanced connection pool settings for Phase 3
    maxOpenConns: parseInt(process.env.DB_MAX_OPEN_CONNS) || 100,
    maxIdleConns: parseInt(process.env.DB_MAX_IDLE_CONNS) || 25,
    connMaxLifetimeMs: parseInt(process.env.DB_CONN_MAX_LIFETIME_MS) || 300000, // 5 minutes
    connMaxIdleTimeMs: parseInt(process.env.DB_CONN_MAX_IDLE_TIME_MS) || 120000  // 2 minutes
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672',
    enabled: process.env.RABBITMQ_ENABLED !== 'false'
  },
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'ride-matching'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB) || 0,
    enabled: process.env.REDIS_ENABLED !== 'false',
    // Cache TTL settings (in seconds)
    ttl: {
      driver: parseInt(process.env.REDIS_TTL_DRIVER) || 300,
      driverLocation: parseInt(process.env.REDIS_TTL_DRIVER_LOCATION) || 60,
      ride: parseInt(process.env.REDIS_TTL_RIDE) || 300,
      user: parseInt(process.env.REDIS_TTL_USER) || 600
    }
  },
  monitoring: {
    enabled: process.env.MONITORING_ENABLED !== 'false',
    metricsPath: process.env.METRICS_PATH || '/metrics',
    newRelicEnabled: process.env.NEW_RELIC_ENABLED === 'true',
    newRelicLicenseKey: process.env.NEW_RELIC_LICENSE_KEY || '',
    newRelicAppName: process.env.NEW_RELIC_APP_NAME || 'RideHailing-API'
  },
  cache: {
    // Driver matching settings
    geoSearchRadius: parseFloat(process.env.GEO_SEARCH_RADIUS_KM) || 10,
    maxNearbyDrivers: parseInt(process.env.MAX_NEARBY_DRIVERS) || 50
  }
};

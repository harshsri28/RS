// src/cmd/api.js
// Phase 3: Enhanced with Redis caching, metrics, and performance monitoring
import express from 'express';
import { config } from '../internal/config/config.js';
import { createConnection, configureConnectionPool, getPoolStats, gracefulShutdown } from '../pkg/database/mysql.js';
import { createRouter } from '../internal/api/router.js';
import { UserRepository } from '../internal/repository/user_repository.js';
import { DriverRepository } from '../internal/repository/driver_repository.js';
import { RideRepository } from '../internal/repository/ride_repository.js';
import { TripRepository } from '../internal/repository/trip_repository.js';
import { PaymentRepository } from '../internal/repository/payment_repository.js';
import { CachedDriverRepository } from '../internal/repository/cached_driver_repository.js';
import { RideService } from '../internal/services/ride_service.js';
import { DriverService } from '../internal/services/driver_service.js';
import { TripService } from '../internal/services/trip_service.js';
import { UserService } from '../internal/services/user_service.js';
import { CachedDriverService } from '../internal/services/cached_driver_service.js';
import { CachedRideService } from '../internal/services/cached_ride_service.js';
import { FareCalculator } from '../internal/services/fare/fare_calculator.js';
import { recoveryMiddleware } from '../internal/api/middlewares/recovery.js';
import { logger } from '../internal/api/middlewares/logging.js';
import { createRabbitMQ } from '../pkg/messaging/rabbitmq.js';
import { setupRabbitMQ } from '../internal/messaging/setup.js';
import { createRedisCache } from '../pkg/cache/redis.js';
import { createMetrics, metricsMiddleware, metricsHandler } from '../internal/metrics/metrics.js';
import { WebSocketHub } from '../internal/websocket/hub.js';
import { createWebSocketServer } from '../internal/api/handlers/websocket_handler.js';
import { NotificationService } from '../internal/services/notification/notification_service.js';
import { createWebSocketNotificationConsumer } from '../internal/consumers/websocket_notification_consumer.js';
import { Queues } from '../internal/messaging/events.js';
import { Client, Connection } from '@temporalio/client';

async function bootstrap() {
  try {
    // Initialize database with enhanced connection pool
    const db = createConnection(config.database);
    configureConnectionPool(db, config.database);

    // Verify database connection
    await db.raw('SELECT 1');
    logger.info('Database connection established');

    // Initialize Redis cache (optional but recommended)
    let cache = null;
    if (config.redis.enabled) {
      try {
        cache = await createRedisCache({
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password || undefined,
          db: config.redis.db
        });
        logger.info('Redis cache connection established');
      } catch (redisError) {
        logger.warn({ err: redisError }, 'Redis connection failed, running without cache');
      }
    }

    // Initialize metrics collector
    const metrics = createMetrics({
      enabled: config.monitoring.enabled,
      prefix: 'ridehailing_'
    });
    logger.info('Metrics collector initialized');

    // Initialize WebSocket hub
    const wsHub = new WebSocketHub();
    logger.info('WebSocket hub initialized');

    // Initialize notification service
    const notificationService = new NotificationService(wsHub);

    // RabbitMQ connection (optional)
    let rabbitMQ = null;
    if (config.rabbitmq.enabled) {
      try {
        rabbitMQ = await createRabbitMQ(config.rabbitmq.url);
        await setupRabbitMQ(rabbitMQ);
        logger.info('RabbitMQ connection established');
      } catch (rmqError) {
        logger.warn({ err: rmqError }, 'RabbitMQ connection failed, running without async processing');
      }
    }

    // Initialize Temporal client for signaling workflows
    let temporalClient = null;
    if (config.temporal?.enabled !== false) {
      try {
        const temporalConnection = await Connection.connect({
          address: config.temporal?.address || 'localhost:7233'
        });
        temporalClient = new Client({
          connection: temporalConnection,
          namespace: config.temporal?.namespace || 'default'
        });
        logger.info('Temporal client connected');
      } catch (temporalError) {
        logger.warn({ err: temporalError }, 'Temporal connection failed, driver signaling will use fallback');
      }
    }

    // Repositories
    const userRepo = new UserRepository(db);
    const driverRepo = new DriverRepository(db);
    const rideRepo = new RideRepository(db);
    const tripRepo = new TripRepository(db);
    const paymentRepo = new PaymentRepository(db);

    // Cached repositories (Phase 3)
    let cachedDriverRepo = driverRepo;
    if (cache) {
      cachedDriverRepo = new CachedDriverRepository(driverRepo, cache, metrics);
      logger.info('Using cached driver repository');
    }

    // Services (inject cache and RabbitMQ for enhanced performance)
    const fareCalculator = new FareCalculator();
    
    // Use cached services when cache is available
    let rideService, driverService;
    
    if (cache) {
      rideService = new CachedRideService(rideRepo, cachedDriverRepo, fareCalculator, cache, rabbitMQ, metrics);
      driverService = new CachedDriverService(cachedDriverRepo, rideRepo, cache, rabbitMQ, metrics, temporalClient);
      logger.info('Using cached services for improved performance');
    } else {
      rideService = new RideService(rideRepo, driverRepo, fareCalculator, rabbitMQ);
      driverService = new DriverService(driverRepo, rideRepo, rabbitMQ, temporalClient);
    }
    
    const tripService = new TripService(tripRepo, rideRepo, cachedDriverRepo, fareCalculator);
    const userService = new UserService(userRepo);

    const services = {
      rideService,
      driverService,
      tripService,
      userService,
      cache, // Expose cache for handlers if needed
      metrics, // Expose metrics for handlers
      notificationService, // Real-time notifications
      wsHub // WebSocket hub for stats
    };

    const app = express();
    
    // Apply metrics middleware
    if (config.monitoring.enabled) {
      app.use(metricsMiddleware(metrics));
    }
    
    // Metrics endpoint
    app.get(config.monitoring.metricsPath || '/metrics', metricsHandler(metrics));
    
    // Health check endpoint with detailed status
    app.get('/health', async (req, res) => {
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'unknown',
        redis: cache ? 'unknown' : 'disabled',
        rabbitmq: rabbitMQ ? 'unknown' : 'disabled'
      };
      
      try {
        await db.raw('SELECT 1');
        health.database = 'connected';
        health.dbPool = getPoolStats(db);
      } catch (error) {
        health.database = 'error';
        health.status = 'degraded';
      }
      
      if (cache) {
        try {
          health.redis = cache.isReady() ? 'connected' : 'disconnected';
        } catch (error) {
          health.redis = 'error';
        }
      }
      
      if (rabbitMQ) {
        health.rabbitmq = 'connected'; // Simplified check
      }
      
      res.status(health.status === 'ok' ? 200 : 503).json(health);
    });
    
    const router = createRouter(services, db);
    app.use(router);
    app.use(recoveryMiddleware);

    const server = app.listen(config.server.port, config.server.host, async () => {
      logger.info(`Server listening on ${config.server.host}:${config.server.port}`);
      logger.info(`Metrics available at ${config.monitoring.metricsPath || '/metrics'}`);
      logger.info(`Health check at /health`);

      // Initialize WebSocket server
      try {
        await createWebSocketServer(server, wsHub);
        logger.info('WebSocket server started on /ws');
        
        // Start WebSocket notification consumer if RabbitMQ is available
        if (rabbitMQ) {
          const wsNotificationConsumer = createWebSocketNotificationConsumer(wsHub);
          await wsNotificationConsumer.start(rabbitMQ, Queues.WEBSOCKET_NOTIFICATIONS);
          logger.info('WebSocket notification consumer started');
        }
      } catch (wsError) {
        logger.warn({ err: wsError }, 'WebSocket server initialization failed');
      }
    });

    // Sync available drivers to geo index on startup (if cache available)
    if (cache && cachedDriverRepo.syncAllDriversToGeoIndex) {
      try {
        // Get all tenants (simplified - in production, iterate through tenants)
        const syncCount = await cachedDriverRepo.syncAllDriversToGeoIndex('default');
        logger.info(`Synced ${syncCount} drivers to geo index`);
      } catch (syncError) {
        logger.warn({ err: syncError }, 'Failed to sync drivers to geo index');
      }
    }

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} signal received: closing HTTP server`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Close connections in order
        if (cache) {
          try {
            await cache.close();
            logger.info('Redis connection closed');
          } catch (error) {
            logger.error({ err: error }, 'Error closing Redis');
          }
        }
        
        if (rabbitMQ) {
          try {
            await rabbitMQ.close();
            logger.info('RabbitMQ connection closed');
          } catch (error) {
            logger.error({ err: error }, 'Error closing RabbitMQ');
          }
        }

        // Close WebSocket connections
        try {
          wsHub.closeAll();
          logger.info('WebSocket connections closed');
        } catch (error) {
          logger.error({ err: error }, 'Error closing WebSocket connections');
        }
        
        await gracefulShutdown(db);
        
        logger.info('All connections closed, exiting');
        process.exit(0);
      });
      
      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error(err, 'Failed to start application');
    process.exit(1);
  }
}

bootstrap();

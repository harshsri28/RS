// src/cmd/api.js
import express from 'express';
import { config } from '../internal/config/config.js';
import { createConnection } from '../pkg/database/mysql.js';
import { createRouter } from '../internal/api/router.js';
import { UserRepository } from '../internal/repository/user_repository.js';
import { DriverRepository } from '../internal/repository/driver_repository.js';
import { RideRepository } from '../internal/repository/ride_repository.js';
import { TripRepository } from '../internal/repository/trip_repository.js';
import { PaymentRepository } from '../internal/repository/payment_repository.js';
import { RideService } from '../internal/services/ride_service.js';
import { DriverService } from '../internal/services/driver_service.js';
import { TripService } from '../internal/services/trip_service.js';
import { UserService } from '../internal/services/user_service.js';
import { FareCalculator } from '../internal/services/fare/fare_calculator.js';
import { recoveryMiddleware } from '../internal/api/middlewares/recovery.js';
import { logger } from '../internal/api/middlewares/logging.js';
import { createRabbitMQ } from '../pkg/messaging/rabbitmq.js';
import { setupRabbitMQ } from '../internal/messaging/setup.js';

async function bootstrap() {
  try {
    const db = createConnection(config.database);

    // Verify database connection
    await db.raw('SELECT 1');
    logger.info('Database connection established');

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

    // Repositories
    const userRepo = new UserRepository(db);
    const driverRepo = new DriverRepository(db);
    const rideRepo = new RideRepository(db);
    const tripRepo = new TripRepository(db);
    const paymentRepo = new PaymentRepository(db);

    // Services (inject RabbitMQ for async processing)
    const fareCalculator = new FareCalculator();
    const rideService = new RideService(rideRepo, driverRepo, fareCalculator, rabbitMQ);
    const driverService = new DriverService(driverRepo, rideRepo, rabbitMQ);
    const tripService = new TripService(tripRepo, rideRepo, driverRepo, fareCalculator);
    const userService = new UserService(userRepo);

    const services = {
      rideService,
      driverService,
      tripService,
      userService
    };

    const app = express();
    const router = createRouter(services, db);

    app.use(router);
    app.use(recoveryMiddleware);

    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info(`Server listening on ${config.server.host}:${config.server.port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        logger.info('HTTP server closed');
        if (rabbitMQ) {
          await rabbitMQ.close();
        }
        db.destroy();
        process.exit(0);
      });
    });

  } catch (err) {
    logger.error(err, 'Failed to start application');
    process.exit(1);
  }
}

bootstrap();

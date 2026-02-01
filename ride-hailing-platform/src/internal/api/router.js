// src/internal/api/router.js
import express from 'express';
import { RideHandler } from './handlers/ride_handler.js';
import { DriverHandler } from './handlers/driver_handler.js';
import { TripHandler } from './handlers/trip_handler.js';
import { UserHandler } from './handlers/user_handler.js';
import { HealthHandler } from './handlers/health_handler.js';
import { authMiddleware } from './middlewares/auth.js';
import { loggingMiddleware } from './middlewares/logging.js';
import { idempotencyMiddleware } from './middlewares/idempotency.js';

export function createRouter(services, db) {
  const router = express.Router();

  const rideHandler = new RideHandler(services.rideService);
  const driverHandler = new DriverHandler(services.driverService);
  const tripHandler = new TripHandler(services.tripService);
  const userHandler = new UserHandler(services.userService);
  const healthHandler = new HealthHandler(db);

  // Global Middlewares
  router.use(express.json());
  router.use(loggingMiddleware);
  router.use(authMiddleware);

  // Health
  router.get('/health', (req, res) => healthHandler.health(req, res));

  // V1 API
  const v1 = express.Router();
  v1.use(idempotencyMiddleware);

  // Users
  v1.post('/users', (req, res) => userHandler.createUser(req, res));
  v1.get('/users/:id', (req, res) => userHandler.getUser(req, res));

  // Rides
  v1.post('/rides', (req, res) => rideHandler.createRide(req, res));
  v1.get('/rides/:id', (req, res) => rideHandler.getRide(req, res));
  v1.post('/rides/:id/cancel', (req, res) => rideHandler.cancelRide(req, res));

  // Drivers
  v1.post('/drivers', (req, res) => driverHandler.createDriver(req, res));
  v1.get('/drivers/:id', (req, res) => driverHandler.getDriver(req, res));
  v1.post('/drivers/:id/location', (req, res) => driverHandler.updateLocation(req, res));
  v1.post('/drivers/:id/status', (req, res) => driverHandler.updateStatus(req, res));
  v1.post('/drivers/:id/accept', (req, res) => driverHandler.acceptRide(req, res));

  // Trips
  v1.post('/trips', (req, res) => tripHandler.startTrip(req, res));
  v1.get('/trips/:id', (req, res) => tripHandler.getTrip(req, res));
  v1.post('/trips/:id/end', (req, res) => tripHandler.endTrip(req, res));

  router.use('/v1', v1);

  return router;
}

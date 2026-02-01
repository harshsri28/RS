// src/cmd/worker.js
import { Worker, NativeConnection } from '@temporalio/worker';
import { Client, Connection } from '@temporalio/client';
import { config } from '../internal/config/config.js';
import { createConnection } from '../pkg/database/mysql.js';
import { createRabbitMQ } from '../pkg/messaging/rabbitmq.js';
import { setupRabbitMQ } from '../internal/messaging/setup.js';
import { Queues } from '../internal/messaging/events.js';
import { DriverRepository } from '../internal/repository/driver_repository.js';
import { RideRepository } from '../internal/repository/ride_repository.js';
import { PaymentRepository } from '../internal/repository/payment_repository.js';
import { createMatchingActivities } from '../internal/temporal/activities/matching.js';
import { createDriverMatchingConsumer } from '../internal/consumers/driver_matching_consumer.js';
import { createLocationConsumer } from '../internal/consumers/location_consumer.js';
import { createNotificationConsumer } from '../internal/consumers/notification_consumer.js';
import { createPaymentConsumer } from '../internal/consumers/payment_consumer.js';

async function run() {
  console.log('Starting ride-hailing worker...');

  // Database connection
  const db = createConnection(config.database);
  await db.raw('SELECT 1');
  console.log('Database connection established');

  // Repositories
  const driverRepo = new DriverRepository(db);
  const rideRepo = new RideRepository(db);
  const paymentRepo = new PaymentRepository(db);

  // RabbitMQ connection
  let rmq = null;
  if (config.rabbitmq.enabled) {
    try {
      rmq = await createRabbitMQ(config.rabbitmq.url);
      await setupRabbitMQ(rmq);
      console.log('RabbitMQ connection established');
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      process.exit(1);
    }
  }

  // Temporal connection
  let temporalClient = null;
  let worker = null;

  try {
    // Create Temporal client connection
    const connection = await Connection.connect({
      address: config.temporal.address
    });

    temporalClient = new Client({
      connection,
      namespace: config.temporal.namespace
    });

    console.log('Temporal client connected');

    // Create native connection for worker
    const nativeConnection = await NativeConnection.connect({
      address: config.temporal.address
    });

    // Create activities with dependencies
    const activities = createMatchingActivities(driverRepo, rideRepo);

    // Create Temporal worker
    worker = await Worker.create({
      connection: nativeConnection,
      namespace: config.temporal.namespace,
      taskQueue: config.temporal.taskQueue,
      workflowsPath: new URL('../internal/temporal/workflows/ride_matching.js', import.meta.url).pathname,
      activities
    });

    console.log('Temporal worker created');
  } catch (error) {
    console.error('Failed to connect to Temporal:', error);
    process.exit(1);
  }

  // Start message consumers
  if (rmq && temporalClient) {
    // Driver Matching Consumer - triggers Temporal workflows
    const matchingConsumer = createDriverMatchingConsumer(temporalClient, config.temporal.taskQueue);
    await matchingConsumer.start(rmq, Queues.DRIVER_MATCHING);
    console.log('Driver matching consumer started');

    // Location Consumer - processes location updates
    const locationConsumer = createLocationConsumer(driverRepo);
    await locationConsumer.start(rmq, Queues.LOCATION_PROCESSING);
    console.log('Location consumer started');

    // Notification Consumer - processes ride and trip notifications
    const notificationConsumer = createNotificationConsumer();
    await notificationConsumer.start(rmq, Queues.NOTIFICATIONS);
    console.log('Notification consumer started');

    // Payment Consumer - processes payments
    const paymentConsumer = createPaymentConsumer(paymentRepo);
    await paymentConsumer.start(rmq, Queues.PAYMENT_PROCESSING);
    console.log('Payment consumer started');
  }

  // Start Temporal worker (this blocks)
  console.log('Starting Temporal worker...');
  
  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down worker...');
    
    if (worker) {
      worker.shutdown();
    }
    
    if (rmq) {
      await rmq.close();
    }
    
    await db.destroy();
    
    console.log('Worker shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Run the worker
  try {
    await worker.run();
  } catch (error) {
    console.error('Worker error:', error);
    await shutdown();
  }
}

run().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});

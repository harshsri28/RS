// src/internal/consumers/driver_matching_consumer.js
import { Client } from '@temporalio/client';
import { RideRequestedEvent } from '../messaging/events.js';

export class DriverMatchingConsumer {
  constructor(temporalClient, taskQueue = 'ride-matching') {
    this.temporalClient = temporalClient;
    this.taskQueue = taskQueue;
  }

  async start(rmq, queueName) {
    console.log(`Driver matching consumer started, listening on queue: ${queueName}`);
    
    // Set prefetch to process one message at a time
    await rmq.prefetch(1);

    await rmq.consume(queueName, async (message) => {
      if (!message) return;
      
      try {
        await this.processMessage(message, rmq);
      } catch (error) {
        console.error('Error processing message:', error);
        rmq.nack(message, true); // Requeue on error
      }
    });
  }

  async processMessage(message, rmq) {
    let event;
    try {
      const content = JSON.parse(message.content.toString());
      event = RideRequestedEvent.fromJSON(content);
    } catch (parseError) {
      console.error('Failed to parse message:', parseError);
      rmq.nack(message, false); // Don't requeue malformed messages
      return;
    }

    console.log(`Processing ride request: ${event.rideId}`);

    try {
      // Start Temporal workflow
      const workflowId = `ride-matching-${event.rideId}`;
      
      const handle = await this.temporalClient.workflow.start('rideMatchingWorkflow', {
        taskQueue: this.taskQueue,
        workflowId,
        args: [{
          rideId: event.rideId,
          tenantId: event.tenantId,
          riderId: event.riderId,
          vehicleType: event.vehicleType,
          pickupLatitude: event.pickupLatitude,
          pickupLongitude: event.pickupLongitude
        }]
      });

      console.log(`Started workflow: ${handle.workflowId}, RunID: ${handle.firstExecutionRunId}`);
      
      rmq.ack(message);
    } catch (workflowError) {
      console.error('Failed to start workflow:', workflowError);
      
      // Check if workflow already exists (idempotency)
      if (workflowError.message?.includes('already started')) {
        console.log('Workflow already exists, acknowledging message');
        rmq.ack(message);
      } else {
        rmq.nack(message, true); // Requeue for retry
      }
    }
  }
}

export function createDriverMatchingConsumer(temporalClient, taskQueue) {
  return new DriverMatchingConsumer(temporalClient, taskQueue);
}

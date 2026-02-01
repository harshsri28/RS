// src/internal/consumers/notification_consumer.js
import { logger } from '../api/middlewares/logging.js';

export class NotificationConsumer {
  constructor() {
    // In a real app, this might have dependencies like Twilio, Firebase Cloud Messaging, etc.
  }

  async start(rmq, queueName) {
    console.log(`Notification consumer started, listening on queue: ${queueName}`);
    
    await rmq.prefetch(10);

    await rmq.consume(queueName, async (message) => {
      if (!message) return;
      
      try {
        await this.processMessage(message, rmq);
      } catch (error) {
        console.error('Error processing notification message:', error);
        rmq.nack(message, true); // Requeue on error
      }
    });
  }

  async processMessage(message, rmq) {
    const routingKey = message.fields.routingKey;
    let event;
    
    try {
      event = JSON.parse(message.content.toString());
    } catch (parseError) {
      console.error('Failed to parse notification message:', parseError);
      rmq.nack(message, false);
      return;
    }

    console.log(`[Notification] Received event: ${routingKey}`);
    
    // Simulate sending notification based on routing key
    switch (routingKey) {
      case 'ride.requested':
        console.log(`Notification: New ride requested! RideID: ${event.rideId}`);
        break;
      case 'ride.assigned':
        console.log(`Notification: Ride ${event.rideId} assigned to driver ${event.driverId}`);
        break;
      case 'trip.started':
        console.log(`Notification: Trip ${event.tripId} started!`);
        break;
      case 'trip.ended':
        console.log(`Notification: Trip ${event.tripId} ended. Please rate your ride.`);
        break;
      default:
        console.log(`Notification: Event ${routingKey} received for ${event.rideId || event.tripId}`);
    }

    // Acknowledge the message
    rmq.ack(message);
  }
}

export function createNotificationConsumer() {
  return new NotificationConsumer();
}

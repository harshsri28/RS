// src/internal/consumers/location_consumer.js
import { DriverLocationUpdatedEvent } from '../messaging/events.js';

export class LocationConsumer {
  constructor(driverRepo) {
    this.driverRepo = driverRepo;
  }

  async start(rmq, queueName) {
    console.log(`Location consumer started, listening on queue: ${queueName}`);
    
    // Set prefetch to allow batch processing
    await rmq.prefetch(10);

    await rmq.consume(queueName, async (message) => {
      if (!message) return;
      
      try {
        await this.processMessage(message, rmq);
      } catch (error) {
        console.error('Error processing location message:', error);
        rmq.nack(message, true); // Requeue on error
      }
    });
  }

  async processMessage(message, rmq) {
    let event;
    try {
      const content = JSON.parse(message.content.toString());
      event = DriverLocationUpdatedEvent.fromJSON(content);
    } catch (parseError) {
      console.error('Failed to parse location message:', parseError);
      rmq.nack(message, false); // Don't requeue malformed messages
      return;
    }

    try {
      // Update driver location in database
      await this.driverRepo.updateLocation(
        event.driverId,
        event.latitude,
        event.longitude
      );

      // Update driver status if provided
      if (event.status) {
        await this.driverRepo.updateStatus(event.driverId, event.status);
      }

      rmq.ack(message);
    } catch (error) {
      console.error(`Failed to update driver location for ${event.driverId}:`, error);
      rmq.nack(message, true); // Requeue for retry
    }
  }
}

export function createLocationConsumer(driverRepo) {
  return new LocationConsumer(driverRepo);
}

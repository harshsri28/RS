// src/internal/consumers/payment_consumer.js
import { PaymentInitiatedEvent } from '../messaging/events.js';

export class PaymentConsumer {
  constructor(paymentRepo) {
    this.paymentRepo = paymentRepo;
  }

  async start(rmq, queueName) {
    console.log(`Payment processing consumer started, listening on queue: ${queueName}`);
    
    await rmq.prefetch(5);

    await rmq.consume(queueName, async (message) => {
      if (!message) return;
      
      try {
        await this.processMessage(message, rmq);
      } catch (error) {
        console.error('Error processing payment message:', error);
        rmq.nack(message, true); // Requeue on error
      }
    });
  }

  async processMessage(message, rmq) {
    let event;
    try {
      const content = JSON.parse(message.content.toString());
      event = PaymentInitiatedEvent.fromJSON(content);
    } catch (parseError) {
      console.error('Failed to parse payment message:', parseError);
      rmq.nack(message, false);
      return;
    }

    console.log(`[Payment] Processing payment ${event.paymentId} for trip ${event.tripId}`);

    try {
      // Simulate calling a payment gateway (Stripe, PayPal, etc.)
      const success = await this.simulatePaymentGateway(event);

      if (success) {
        // Update payment status in database
        if (this.paymentRepo) {
          await this.paymentRepo.updateStatus(event.paymentId, 'completed');
        }
        console.log(`[Payment] Payment ${event.paymentId} processed successfully`);
        rmq.ack(message);
      } else {
        console.error(`[Payment] Payment ${event.paymentId} failed`);
        if (this.paymentRepo) {
          await this.paymentRepo.updateStatus(event.paymentId, 'failed');
        }
        rmq.ack(message); // Still ack because we handled the failure status
      }
    } catch (error) {
      console.error(`[Payment] Internal error processing payment ${event.paymentId}:`, error);
      rmq.nack(message, true); // Requeue for retry
    }
  }

  async simulatePaymentGateway(event) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 90% success rate
    return Math.random() > 0.1;
  }
}

export function createPaymentConsumer(paymentRepo) {
  return new PaymentConsumer(paymentRepo);
}

// src/internal/messaging/setup.js
import { Exchanges, Queues } from './events.js';

export async function setupRabbitMQ(rmq) {
  // Declare exchanges
  const exchanges = [
    { name: Exchanges.RIDES, type: 'topic' },
    { name: Exchanges.DRIVERS, type: 'topic' },
    { name: Exchanges.TRIPS, type: 'topic' },
    { name: Exchanges.PAYMENTS, type: 'topic' }
  ];

  for (const exchange of exchanges) {
    await rmq.declareExchange(exchange.name, exchange.type);
    console.log(`Exchange declared: ${exchange.name}`);
  }

  // Declare queues
  const queues = [
    Queues.DRIVER_MATCHING,
    Queues.LOCATION_PROCESSING,
    Queues.NOTIFICATIONS,
    Queues.PAYMENT_PROCESSING
  ];

  for (const queue of queues) {
    await rmq.declareQueue(queue);
    console.log(`Queue declared: ${queue}`);
  }

  // Bind queues to exchanges
  const bindings = [
    { queue: Queues.DRIVER_MATCHING, routingKey: 'ride.requested', exchange: Exchanges.RIDES },
    { queue: Queues.LOCATION_PROCESSING, routingKey: 'driver.location.*', exchange: Exchanges.DRIVERS },
    { queue: Queues.NOTIFICATIONS, routingKey: 'ride.*', exchange: Exchanges.RIDES },
    { queue: Queues.NOTIFICATIONS, routingKey: 'trip.*', exchange: Exchanges.TRIPS },
    { queue: Queues.PAYMENT_PROCESSING, routingKey: 'payment.*', exchange: Exchanges.PAYMENTS }
  ];

  for (const binding of bindings) {
    await rmq.bindQueue(binding.queue, binding.exchange, binding.routingKey);
    console.log(`Queue ${binding.queue} bound to exchange ${binding.exchange} with key ${binding.routingKey}`);
  }

  console.log('RabbitMQ setup complete');
}

// src/pkg/messaging/rabbitmq.js
import amqp from 'amqplib';

export class RabbitMQ {
  constructor() {
    this.connection = null;
    this.channel = null;
  }

  async connect(url) {
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
    
    // Handle connection errors
    this.connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
    });
    
    this.connection.on('close', () => {
      console.log('RabbitMQ connection closed');
    });

    return this;
  }

  async declareExchange(name, type, options = {}) {
    const defaultOptions = {
      durable: true,
      autoDelete: false,
      internal: false,
      ...options
    };
    
    await this.channel.assertExchange(name, type, defaultOptions);
  }

  async declareQueue(name, options = {}) {
    const defaultOptions = {
      durable: true,
      autoDelete: false,
      exclusive: false,
      ...options
    };
    
    return await this.channel.assertQueue(name, defaultOptions);
  }

  async bindQueue(queueName, exchange, routingKey) {
    await this.channel.bindQueue(queueName, exchange, routingKey);
  }

  async publish(exchange, routingKey, message, options = {}) {
    const content = Buffer.from(JSON.stringify(message));
    const defaultOptions = {
      persistent: true,
      contentType: 'application/json',
      ...options
    };
    
    return this.channel.publish(exchange, routingKey, content, defaultOptions);
  }

  async publishToQueue(queueName, message, options = {}) {
    const content = Buffer.from(JSON.stringify(message));
    const defaultOptions = {
      persistent: true,
      contentType: 'application/json',
      ...options
    };
    
    return this.channel.sendToQueue(queueName, content, defaultOptions);
  }

  async consume(queueName, callback, options = {}) {
    const defaultOptions = {
      noAck: false,
      ...options
    };
    
    return this.channel.consume(queueName, callback, defaultOptions);
  }

  ack(message) {
    this.channel.ack(message);
  }

  nack(message, requeue = false) {
    this.channel.nack(message, false, requeue);
  }

  async prefetch(count) {
    await this.channel.prefetch(count);
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (err) {
      console.error('Error closing RabbitMQ connection:', err);
    }
  }
}

export async function createRabbitMQ(url) {
  const rmq = new RabbitMQ();
  await rmq.connect(url);
  return rmq;
}

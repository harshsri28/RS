// src/internal/consumers/websocket_notification_consumer.js
// Consumes messages from RabbitMQ and sends via WebSocket

import { logger } from '../api/middlewares/logging.js';

export class WebSocketNotificationConsumer {
  constructor(wsHub) {
    this.wsHub = wsHub;
  }

  async start(rmq, queueName) {
    console.log(`WebSocket notification consumer started, listening on queue: ${queueName}`);
    
    await rmq.prefetch(20); // Handle multiple notifications concurrently

    await rmq.consume(queueName, async (message) => {
      if (!message) return;
      
      try {
        await this.processMessage(message, rmq);
      } catch (error) {
        console.error('Error processing WebSocket notification message:', error);
        rmq.nack(message, false); // Don't requeue - it's a notification, not critical
      }
    });
  }

  async processMessage(message, rmq) {
    let event;
    
    try {
      event = JSON.parse(message.content.toString());
    } catch (parseError) {
      console.error('Failed to parse WebSocket notification message:', parseError);
      rmq.nack(message, false);
      return;
    }

    const { type, targetUserId, targetUserIds, payload } = event;

    // Log the notification
    console.log(`[WS Consumer] Processing: type=${type}, targetUserId=${targetUserId}, targetUserIds=${JSON.stringify(targetUserIds)}`);
    console.log(`[WS Consumer] Connected users: ${this.wsHub.clients.size}`);

    let delivered = 0;

    // Send to single user
    if (targetUserId) {
      const isConnected = this.wsHub.isUserConnected(targetUserId);
      console.log(`[WS Consumer] User ${targetUserId} connected: ${isConnected}`);
      delivered = this.wsHub.broadcastToUser(targetUserId, type, payload);
      console.log(`[WS Consumer] Message sent to ${targetUserId}: delivered=${delivered}`);
    }

    // Send to multiple users
    if (targetUserIds && Array.isArray(targetUserIds)) {
      for (const userId of targetUserIds) {
        const count = this.wsHub.broadcastToUser(userId, type, payload);
        delivered += count;
      }
      console.log(`[WS Consumer] Message sent to ${targetUserIds.length} users: delivered=${delivered}`);
    }

    // Acknowledge the message
    rmq.ack(message);

    return { delivered };
  }
}

export function createWebSocketNotificationConsumer(wsHub) {
  return new WebSocketNotificationConsumer(wsHub);
}

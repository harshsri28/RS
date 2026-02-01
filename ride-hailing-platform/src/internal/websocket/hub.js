// src/internal/websocket/hub.js
// WebSocket Hub for managing client connections and broadcasting messages

import { EventEmitter } from 'events';
import { logger } from '../api/middlewares/logging.js';

/**
 * WebSocket Hub - manages all connected clients and message broadcasting
 * Uses a pub/sub pattern to send messages to specific users
 */
export class WebSocketHub extends EventEmitter {
  constructor() {
    super();
    // Map of userId -> Set of Client connections
    this.clients = new Map();
    // Track connection statistics
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesDelivered: 0
    };
  }

  /**
   * Register a new client connection
   * @param {WebSocketClient} client 
   */
  register(client) {
    const userId = client.getUserId();
    
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    
    this.clients.get(userId).add(client);
    this.stats.totalConnections++;
    this.stats.activeConnections++;
    
    console.log(`[WebSocket Hub] Client registered: userId=${userId}, total=${this.stats.activeConnections}`);
    logger.info({ userId, activeConnections: this.stats.activeConnections }, 'WebSocket client registered');
    this.emit('client:connected', { userId, client });
  }

  /**
   * Unregister a client connection
   * @param {WebSocketClient} client 
   */
  unregister(client) {
    const userId = client.getUserId();
    const userClients = this.clients.get(userId);
    
    if (userClients) {
      userClients.delete(client);
      this.stats.activeConnections--;
      
      // Clean up empty user entries
      if (userClients.size === 0) {
        this.clients.delete(userId);
      }
      
      logger.info({ userId, activeConnections: this.stats.activeConnections }, 'WebSocket client unregistered');
      this.emit('client:disconnected', { userId, client });
    }
  }

  /**
   * Broadcast message to a specific user (all their connections)
   * @param {string} userId 
   * @param {string} messageType 
   * @param {object} payload 
   */
  broadcastToUser(userId, messageType, payload) {
    const userClients = this.clients.get(userId);
    
    console.log(`[WebSocket Hub] broadcastToUser: userId=${userId}, type=${messageType}, hasClients=${!!userClients}, clientCount=${userClients?.size || 0}`);
    console.log(`[WebSocket Hub] All connected users: ${Array.from(this.clients.keys()).join(', ')}`);
    
    if (!userClients || userClients.size === 0) {
      console.log(`[WebSocket Hub] No active connections for user ${userId}`);
      logger.debug({ userId, messageType }, 'No active connections for user');
      return 0;
    }

    const message = JSON.stringify({
      type: messageType,
      payload,
      timestamp: new Date().toISOString()
    });

    let delivered = 0;
    for (const client of userClients) {
      try {
        client.send(message);
        delivered++;
        this.stats.messagesDelivered++;
        console.log(`[WebSocket Hub] Message sent to ${userId}: ${messageType}`);
      } catch (error) {
        logger.error({ err: error, userId }, 'Failed to send WebSocket message');
        // Client will be removed when connection closes
      }
    }

    logger.debug({ userId, messageType, delivered }, 'Message broadcast to user');
    return delivered;
  }

  /**
   * Broadcast message to multiple users
   * @param {string[]} userIds 
   * @param {string} messageType 
   * @param {object} payload 
   */
  broadcastToUsers(userIds, messageType, payload) {
    let totalDelivered = 0;
    for (const userId of userIds) {
      totalDelivered += this.broadcastToUser(userId, messageType, payload);
    }
    return totalDelivered;
  }

  /**
   * Broadcast to all connected clients
   * @param {string} messageType 
   * @param {object} payload 
   */
  broadcastAll(messageType, payload) {
    let totalDelivered = 0;
    for (const [userId] of this.clients) {
      totalDelivered += this.broadcastToUser(userId, messageType, payload);
    }
    return totalDelivered;
  }

  /**
   * Check if a user has active connections
   * @param {string} userId 
   */
  isUserConnected(userId) {
    const userClients = this.clients.get(userId);
    return userClients && userClients.size > 0;
  }

  /**
   * Get number of active connections for a user
   * @param {string} userId 
   */
  getUserConnectionCount(userId) {
    const userClients = this.clients.get(userId);
    return userClients ? userClients.size : 0;
  }

  /**
   * Get hub statistics
   */
  getStats() {
    return {
      ...this.stats,
      uniqueUsers: this.clients.size
    };
  }

  /**
   * Close all connections
   */
  closeAll() {
    for (const [userId, userClients] of this.clients) {
      for (const client of userClients) {
        try {
          client.close(1000, 'Server shutting down');
        } catch (error) {
          // Ignore errors during shutdown
        }
      }
    }
    this.clients.clear();
    this.stats.activeConnections = 0;
  }
}

// Export singleton instance
export const wsHub = new WebSocketHub();

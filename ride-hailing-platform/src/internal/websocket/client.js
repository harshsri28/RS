// src/internal/websocket/client.js
// WebSocket Client wrapper for handling individual connections

import { logger } from '../api/middlewares/logging.js';

// Constants for WebSocket connection management
const PING_INTERVAL = 30000; // 30 seconds
const PONG_TIMEOUT = 10000; // 10 seconds

/**
 * WebSocket Client - wraps individual WebSocket connections
 * Handles heartbeat, message sending, and connection lifecycle
 */
export class WebSocketClient {
  constructor(hub, ws, userId) {
    this.hub = hub;
    this.ws = ws;
    this.userId = userId;
    this.isAlive = true;
    this.pingInterval = null;
    this.metadata = {
      connectedAt: new Date(),
      messagesReceived: 0,
      messagesSent: 0
    };

    this.setupHandlers();
    this.startHeartbeat();
  }

  /**
   * Get the user ID for this connection
   */
  getUserId() {
    return this.userId;
  }

  /**
   * Setup WebSocket event handlers
   */
  setupHandlers() {
    this.ws.on('pong', () => {
      this.isAlive = true;
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('close', (code, reason) => {
      this.handleClose(code, reason);
    });

    this.ws.on('error', (error) => {
      logger.error({ err: error, userId: this.userId }, 'WebSocket error');
    });
  }

  /**
   * Start heartbeat ping/pong mechanism
   */
  startHeartbeat() {
    this.pingInterval = setInterval(() => {
      if (!this.isAlive) {
        logger.warn({ userId: this.userId }, 'WebSocket client timed out');
        this.ws.terminate();
        return;
      }

      this.isAlive = false;
      this.ws.ping();
    }, PING_INTERVAL);
  }

  /**
   * Handle incoming messages
   * @param {Buffer|string} data 
   */
  handleMessage(data) {
    this.metadata.messagesReceived++;

    try {
      const message = JSON.parse(data.toString());
      logger.debug({ userId: this.userId, type: message.type }, 'WebSocket message received');

      // Handle different message types from client
      switch (message.type) {
        case 'ping':
          this.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;

        case 'subscribe':
          // Client wants to subscribe to specific events
          this.hub.emit('client:subscribe', {
            userId: this.userId,
            client: this,
            channel: message.channel
          });
          break;

        case 'unsubscribe':
          this.hub.emit('client:unsubscribe', {
            userId: this.userId,
            client: this,
            channel: message.channel
          });
          break;

        default:
          // Emit event for custom message handling
          this.hub.emit('client:message', {
            userId: this.userId,
            client: this,
            message
          });
      }
    } catch (error) {
      logger.error({ err: error, userId: this.userId }, 'Failed to parse WebSocket message');
    }
  }

  /**
   * Handle connection close
   * @param {number} code 
   * @param {string} reason 
   */
  handleClose(code, reason) {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    logger.info({
      userId: this.userId,
      code,
      reason: reason?.toString(),
      duration: Date.now() - this.metadata.connectedAt.getTime()
    }, 'WebSocket connection closed');

    this.hub.unregister(this);
  }

  /**
   * Send a message to this client
   * @param {string} message - JSON string message
   */
  send(message) {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(message);
      this.metadata.messagesSent++;
    } else {
      logger.warn({ userId: this.userId }, 'Attempted to send to closed WebSocket');
    }
  }

  /**
   * Close the connection
   * @param {number} code 
   * @param {string} reason 
   */
  close(code = 1000, reason = 'Normal closure') {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.ws.close(code, reason);
  }

  /**
   * Get client metadata
   */
  getMetadata() {
    return {
      ...this.metadata,
      userId: this.userId,
      isConnected: this.ws.readyState === this.ws.OPEN
    };
  }
}

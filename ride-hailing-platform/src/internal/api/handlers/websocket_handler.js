// src/internal/api/handlers/websocket_handler.js
// WebSocket HTTP upgrade handler

import { parse } from 'url';
import { WebSocketClient } from '../../websocket/client.js';
import { logger } from '../middlewares/logging.js';

/**
 * WebSocket Handler - handles HTTP upgrade requests for WebSocket connections
 */
export class WebSocketHandler {
  constructor(hub) {
    this.hub = hub;
  }

  /**
   * Handle WebSocket upgrade request
   * @param {WebSocket} ws - WebSocket connection from ws library
   * @param {IncomingMessage} request - HTTP upgrade request
   */
  handleUpgrade(ws, request) {
    const { query } = parse(request.url, true);
    const userId = query.user_id;

    if (!userId) {
      logger.warn('WebSocket connection rejected: missing user_id');
      ws.close(4001, 'user_id is required');
      return;
    }

    // Validate user_id format (basic validation)
    if (typeof userId !== 'string' || userId.length < 1 || userId.length > 100) {
      logger.warn({ userId }, 'WebSocket connection rejected: invalid user_id');
      ws.close(4002, 'Invalid user_id format');
      return;
    }

    // Create and register client
    const client = new WebSocketClient(this.hub, ws, userId);
    this.hub.register(client);

    logger.info({ userId }, 'WebSocket connection established');

    // Send welcome message
    client.send(JSON.stringify({
      type: 'connected',
      payload: {
        message: 'Connected to ride-hailing real-time service',
        userId: userId
      },
      timestamp: new Date().toISOString()
    }));
  }

  /**
   * Get WebSocket server stats endpoint handler
   */
  getStats(req, res) {
    const stats = this.hub.getStats();
    res.json({
      status: 'ok',
      websocket: stats
    });
  }
}

/**
 * Create WebSocket server and attach to HTTP server
 * @param {Server} httpServer - HTTP server instance
 * @param {WebSocketHub} hub - WebSocket hub instance
 * @returns {WebSocketServer}
 */
export function createWebSocketServer(httpServer, hub) {
  // Dynamic import to avoid issues if ws is not installed
  return import('ws').then(({ WebSocketServer }) => {
    const wss = new WebSocketServer({ 
      server: httpServer,
      path: '/ws'
    });

    const handler = new WebSocketHandler(hub);

    wss.on('connection', (ws, request) => {
      handler.handleUpgrade(ws, request);
    });

    wss.on('error', (error) => {
      logger.error({ err: error }, 'WebSocket server error');
    });

    logger.info('WebSocket server initialized on /ws');

    return wss;
  });
}

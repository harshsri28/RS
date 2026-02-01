// src/internal/api/handlers/health_handler.js
import { successResponse } from './common.js';

export class HealthHandler {
  constructor(db) {
    this.db = db;
    this.startTime = new Date();
  }

  async health(req, res) {
    let dbStatus = 'healthy';
    try {
      await this.db.raw('SELECT 1');
    } catch (err) {
      dbStatus = 'unhealthy';
    }

    successResponse(res, {
      status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
      uptime: `${Math.round((new Date() - this.startTime) / 1000)}s`,
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus
      }
    }, dbStatus === 'healthy' ? 200 : 503);
  }
}

// src/internal/config/config.js
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  server: {
    port: process.env.SERVER_PORT || 8080,
    host: process.env.SERVER_HOST || '0.0.0.0'
  },
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'ridehail',
    password: process.env.DB_PASSWORD || 'ridehail123',
    database: process.env.DB_NAME || 'ridehail',
    maxOpenConns: parseInt(process.env.DB_MAX_OPEN_CONNS) || 10,
    maxIdleConns: parseInt(process.env.DB_MAX_IDLE_CONNS) || 2
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672',
    enabled: process.env.RABBITMQ_ENABLED !== 'false'
  },
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'ride-matching'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379
  }
};

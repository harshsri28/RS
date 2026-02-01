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
  }
};

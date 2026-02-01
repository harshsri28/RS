// src/pkg/database/mysql.js
import knex from 'knex';

/**
 * Create optimized database connection with Phase 3 connection pool settings
 * @param {Object} config - Database configuration
 * @returns {Knex} Knex database instance
 */
export function createConnection(config) {
  const db = knex({
    client: 'mysql2',
    connection: {
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      timezone: 'Z',
      // Connection encoding for proper character support
      charset: 'utf8mb4',
      // Type casting for proper decimal handling
      typeCast: function (field, next) {
        if (field.type === 'DECIMAL') {
          return parseFloat(field.string());
        }
        if (field.type === 'TINY' && field.length === 1) {
          return field.string() === '1';
        }
        return next();
      },
      // Connection flags for better performance
      flags: [
        'FOUND_ROWS', // Return found rows instead of affected rows
      ]
    },
    pool: {
      // Phase 3: Enhanced connection pool settings
      min: config.maxIdleConns || 25,
      max: config.maxOpenConns || 100,
      // Connection lifecycle settings
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: config.connMaxIdleTimeMs || 120000, // 2 minutes
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      // Validation on acquire
      propagateCreateError: false,
    },
    // Acquire connection settings
    acquireConnectionTimeout: 60000,
    // Debug mode (disable in production)
    debug: process.env.DB_DEBUG === 'true',
    // Log configuration
    log: {
      warn(message) {
        console.warn('[DB Warning]', message);
      },
      error(message) {
        console.error('[DB Error]', message);
      },
      deprecate(message) {
        console.log('[DB Deprecation]', message);
      },
      debug(message) {
        if (process.env.DB_DEBUG === 'true') {
          console.log('[DB Debug]', message);
        }
      }
    }
  });

  return db;
}

/**
 * Configure connection pool after creation
 * Call this after creating the connection for additional tuning
 * @param {Knex} db - Knex database instance
 * @param {Object} config - Pool configuration
 */
export function configureConnectionPool(db, config = {}) {
  // Get the underlying pool
  const pool = db.client.pool;
  
  if (pool) {
    // Log pool statistics periodically
    if (process.env.DB_POOL_STATS === 'true') {
      setInterval(() => {
        console.log('[DB Pool Stats]', {
          numUsed: pool.numUsed(),
          numFree: pool.numFree(),
          numPendingAcquires: pool.numPendingAcquires(),
          numPendingCreates: pool.numPendingCreates()
        });
      }, 30000); // Every 30 seconds
    }
  }
  
  return db;
}

/**
 * Health check for database connection
 * @param {Knex} db - Knex database instance
 * @returns {Promise<boolean>}
 */
export async function healthCheck(db) {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch (error) {
    console.error('[DB Health Check Failed]', error.message);
    return false;
  }
}

/**
 * Get pool statistics
 * @param {Knex} db - Knex database instance
 * @returns {Object} Pool statistics
 */
export function getPoolStats(db) {
  const pool = db.client.pool;
  if (!pool) return null;
  
  return {
    used: pool.numUsed(),
    free: pool.numFree(),
    pendingAcquires: pool.numPendingAcquires(),
    pendingCreates: pool.numPendingCreates(),
    size: pool.numUsed() + pool.numFree()
  };
}

/**
 * Graceful shutdown of database connection
 * @param {Knex} db - Knex database instance
 * @returns {Promise<void>}
 */
export async function gracefulShutdown(db) {
  console.log('[DB] Starting graceful shutdown...');
  try {
    await db.destroy();
    console.log('[DB] Connection pool closed');
  } catch (error) {
    console.error('[DB] Error during shutdown:', error.message);
  }
}

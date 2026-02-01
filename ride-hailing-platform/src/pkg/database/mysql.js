// src/pkg/database/mysql.js
import knex from 'knex';

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
      typeCast: function (field, next) {
        if (field.type === 'DECIMAL') {
          return parseFloat(field.string());
        }
        return next();
      }
    },
    pool: {
      min: config.maxIdleConns || 2,
      max: config.maxOpenConns || 10
    }
  });

  return db;
}

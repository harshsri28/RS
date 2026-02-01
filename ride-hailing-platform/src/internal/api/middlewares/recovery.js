// src/internal/api/middlewares/recovery.js
import { logger } from './logging.js';

export const recoveryMiddleware = (err, req, res, next) => {
  logger.error(err);
  
  const status = err.httpStatus || 500;
  const body = err.toJSON ? err.toJSON() : {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: err.message
    }
  };

  res.status(status).json(body);
};

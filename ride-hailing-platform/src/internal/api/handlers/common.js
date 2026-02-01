// src/internal/api/handlers/common.js
import { AppError } from '../../models/errors.js';

export const successResponse = (res, data, status = 200) => {
  res.status(status).json(data);
};

export const errorResponse = (res, err) => {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json(err.toJSON());
  } else {
    console.error(err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
        details: err.message
      }
    });
  }
};

export const getPagination = (req) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  return { limit, offset };
};

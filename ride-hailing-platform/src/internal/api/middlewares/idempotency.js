// src/internal/api/middlewares/idempotency.js
export const idempotencyMiddleware = (req, res, next) => {
  if (req.method === 'POST') {
    const key = req.headers['idempotency-key'];
    if (!key) {
      return res.status(400).json({
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Idempotency-Key header is required for POST requests'
        }
      });
    }
  }
  next();
};

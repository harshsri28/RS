// src/internal/api/middlewares/logging.js
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty'
  }
});

export const loggingMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      tenantId: req.tenantId
    });
  });

  next();
};

export { logger };

// src/internal/api/middlewares/auth.js
export const authMiddleware = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || 'default';
  req.tenantId = tenantId;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    req.userId = authHeader.substring(7);
  }

  next();
};

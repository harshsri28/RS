// src/internal/api/handlers/user_handler.js
import { successResponse, errorResponse } from './common.js';
import { User } from '../../models/user.js';

export class UserHandler {
  constructor(userService) {
    this.userService = userService;
  }

  async createUser(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      const user = await this.userService.createUser(tenantId, req.body);
      successResponse(res, User.toResponse(user), 201);
    } catch (err) {
      errorResponse(res, err);
    }
  }

  async getUser(req, res) {
    try {
      const tenantId = req.headers['x-tenant-id'] || 'default';
      const user = await this.userService.getUser(req.params.id, tenantId);
      successResponse(res, User.toResponse(user));
    } catch (err) {
      errorResponse(res, err);
    }
  }
}

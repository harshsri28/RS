// src/internal/services/user_service.js
import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/user.js';
import { DomainErrors } from '../models/errors.js';

export class UserService {
  constructor(userRepo) {
    this.userRepo = userRepo;
  }

  async createUser(tenantId, data) {
    // Check if user already exists
    const existing = await this.userRepo.getByEmail(data.email);
    if (existing) {
      throw new Error('User with this email already exists');
    }

    const now = new Date();
    const user = new User({
      id: uuidv4(),
      tenant_id: tenantId,
      email: data.email,
      phone: data.phone,
      name: data.name,
      role: data.role || 'rider',
      created_at: now,
      updated_at: now
    });

    await this.userRepo.create(user);
    return user;
  }

  async getUser(id, tenantId) {
    const user = await this.userRepo.getById(id, tenantId);
    if (!user) throw DomainErrors.NOT_FOUND('user');
    return user;
  }
}

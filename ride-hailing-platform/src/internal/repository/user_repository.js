// src/internal/repository/user_repository.js
import { User } from '../models/user.js';
import { DomainErrors } from '../models/errors.js';

export class UserRepository {
  constructor(db) {
    this.db = db;
    this.table = 'users';
  }

  async create(user) {
    await this.db(this.table).insert({
      id: user.id,
      tenant_id: user.tenantId,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      created_at: user.createdAt,
      updated_at: user.updatedAt
    });
  }

  async getById(id, tenantId) {
    const row = await this.db(this.table)
      .where({ id, tenant_id: tenantId })
      .first();
    
    if (!row) return null;
    return new User(row);
  }

  async getByEmail(email) {
    const row = await this.db(this.table)
      .where({ email })
      .first();
    
    if (!row) return null;
    return new User(row);
  }

  async update(user) {
    const affected = await this.db(this.table)
      .where({ id: user.id, tenant_id: user.tenantId })
      .update({
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        updated_at: new Date()
      });
    
    if (affected === 0) throw DomainErrors.NOT_FOUND('user');
  }

  async delete(id, tenantId) {
    const affected = await this.db(this.table)
      .where({ id, tenant_id: tenantId })
      .delete();
    
    if (affected === 0) throw DomainErrors.NOT_FOUND('user');
  }
}

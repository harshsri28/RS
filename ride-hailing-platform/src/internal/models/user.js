// src/internal/models/user.js
export const UserRole = {
  RIDER: 'rider',
  DRIVER: 'driver',
  ADMIN: 'admin'
};

export class User {
  constructor(data) {
    this.id = data.id;
    this.tenantId = data.tenant_id || data.tenantId;
    this.email = data.email;
    this.phone = data.phone;
    this.name = data.name;
    this.role = data.role;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  static toResponse(user) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt
    };
  }
}

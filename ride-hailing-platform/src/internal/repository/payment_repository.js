// src/internal/repository/payment_repository.js
import { Payment } from '../models/payment.js';
import { DomainErrors } from '../models/errors.js';

export class PaymentRepository {
  constructor(db) {
    this.db = db;
    this.table = 'payments';
  }

  async create(payment) {
    await this.db(this.table).insert({
      id: payment.id,
      trip_id: payment.tripId,
      rider_id: payment.riderId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      payment_method: payment.paymentMethod,
      psp_name: payment.pspName,
      idempotency_key: payment.idempotencyKey,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt
    });
  }

  async getById(id) {
    const row = await this.db(this.table).where({ id }).first();
    if (!row) return null;
    return new Payment(row);
  }

  async getByTripId(tripId) {
    const row = await this.db(this.table).where({ trip_id: tripId }).first();
    if (!row) return null;
    return new Payment(row);
  }

  async updateStatus(id, status, pspTxnId = null, failureReason = null) {
    await this.db(this.table)
      .where({ id })
      .update({
        status,
        psp_transaction_id: pspTxnId,
        failure_reason: failureReason,
        updated_at: new Date()
      });
  }
}

// src/internal/models/payment.js
export const PaymentStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REFUNDED: 'refunded'
};

export class Payment {
  constructor(data) {
    this.id = data.id;
    this.tripId = data.trip_id || data.tripId;
    this.riderId = data.rider_id || data.riderId;
    this.amount = data.amount;
    this.currency = data.currency || 'INR';
    this.status = data.status || PaymentStatus.PENDING;
    this.paymentMethod = data.payment_method || data.paymentMethod;
    this.pspName = data.psp_name || data.pspName;
    this.pspTransactionId = data.psp_transaction_id || data.pspTransactionId;
    this.failureReason = data.failure_reason || data.failureReason;
    this.idempotencyKey = data.idempotency_key || data.idempotencyKey;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  static toResponse(payment) {
    return {
      paymentId: payment.id,
      tripId: payment.tripId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      pspName: payment.pspName,
      pspTransactionId: payment.pspTransactionId,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt
    };
  }
}

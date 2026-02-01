// src/internal/services/fare/base_strategy.js
export class BaseFareStrategy {
  constructor(baseFare, perKmRate, perMinuteRate, vehicleType) {
    this.baseFare = baseFare;
    this.perKmRate = perKmRate;
    this.perMinuteRate = perMinuteRate;
    this.vehicleType = vehicleType;
  }

  calculate(distanceKm, durationMinutes, surgeMultiplier = 1.0) {
    const distanceFare = distanceKm * this.perKmRate;
    const timeFare = durationMinutes * this.perMinuteRate;
    const subtotal = (this.baseFare + distanceFare + timeFare) * surgeMultiplier;
    const taxes = subtotal * 0.18; // 18% GST
    const totalFare = Math.round((subtotal + taxes) * 100) / 100;

    return {
      baseFare: this.baseFare,
      distanceFare,
      timeFare,
      surgeMultiplier,
      subtotal,
      taxes,
      totalFare,
      currency: 'INR'
    };
  }

  estimate(distanceKm) {
    // Avg 3 mins per km
    const estimatedDuration = distanceKm * 3;
    return this.calculate(distanceKm, estimatedDuration).totalFare;
  }
}

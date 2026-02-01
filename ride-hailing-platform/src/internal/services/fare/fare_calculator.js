// src/internal/services/fare/fare_calculator.js
import { EconomyFareStrategy, PremiumFareStrategy, LuxuryFareStrategy } from './strategies.js';

export class FareCalculator {
  constructor() {
    this.strategies = {
      economy: new EconomyFareStrategy(),
      premium: new PremiumFareStrategy(),
      luxury: new LuxuryFareStrategy()
    };
  }

  getStrategy(vehicleType) {
    const strategy = this.strategies[vehicleType];
    if (!strategy) throw new Error(`No fare strategy for vehicle type: ${vehicleType}`);
    return strategy;
  }

  calculateFare(vehicleType, distanceKm, durationMinutes, surgeMultiplier = 1.0) {
    return this.getStrategy(vehicleType).calculate(distanceKm, durationMinutes, surgeMultiplier);
  }

  estimateFare(vehicleType, from, to) {
    const distance = this.calculateDistance(from, to);
    return this.getStrategy(vehicleType).estimate(distance);
  }

  calculateDistance(from, to) {
    const R = 6371; // Earth radius in km
    const dLat = (to.latitude - from.latitude) * Math.PI / 180;
    const dLon = (to.longitude - from.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(from.latitude * Math.PI / 180) * Math.cos(to.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance * 1.3; // Road factor
  }
}

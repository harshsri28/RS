// src/internal/services/fare/economy_strategy.js
import { BaseFareStrategy } from './base_strategy.js';

export class EconomyFareStrategy extends BaseFareStrategy {
  constructor() {
    super(50.0, 12.0, 1.5, 'economy');
  }
}

// src/internal/services/fare/premium_strategy.js
export class PremiumFareStrategy extends BaseFareStrategy {
  constructor() {
    super(80.0, 18.0, 2.0, 'premium');
  }
}

// src/internal/services/fare/luxury_strategy.js
export class LuxuryFareStrategy extends BaseFareStrategy {
  constructor() {
    super(150.0, 25.0, 3.0, 'luxury');
  }
}

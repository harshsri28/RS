// src/internal/repository/optimized_queries.js
/**
 * Optimized query helpers for Phase 3 performance improvements
 * These queries are designed to work with the indexes created in migration 005
 */

/**
 * Optimized ride queries
 */
export const RideQueries = {
  /**
   * Get recent rides by rider with pagination (uses idx_rides_rider_created_status)
   */
  getRecentRidesByRider: (db, riderId, limit = 10, offset = 0) => {
    return db('rides')
      .select('id', 'rider_id', 'driver_id', 'status', 'vehicle_type', 
              'estimated_fare', 'created_at', 'assigned_at')
      .where({ rider_id: riderId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get active rides for tenant (uses idx_rides_active)
   */
  getActiveRides: (db, tenantId, limit = 100) => {
    return db('rides')
      .select('*')
      .where({ tenant_id: tenantId })
      .whereNotIn('status', ['completed', 'cancelled'])
      .orderBy('updated_at', 'desc')
      .limit(limit);
  },

  /**
   * Get rides needing driver assignment (uses idx_rides_searching_driver)
   */
  getRidesNeedingDriver: (db, limit = 50) => {
    return db('rides')
      .select('*')
      .where({ status: 'searching_driver' })
      .orderBy('created_at', 'asc')
      .limit(limit);
  },

  /**
   * Batch update ride status (optimized for bulk operations)
   */
  batchUpdateStatus: async (db, rideIds, status) => {
    if (rideIds.length === 0) return 0;
    return db('rides')
      .whereIn('id', rideIds)
      .update({ status, updated_at: new Date() });
  },

  /**
   * Count rides by status for tenant
   */
  countByStatus: (db, tenantId) => {
    return db('rides')
      .select('status')
      .count('* as count')
      .where({ tenant_id: tenantId })
      .groupBy('status');
  }
};

/**
 * Optimized driver queries
 */
export const DriverQueries = {
  /**
   * Get available driver count by vehicle type (uses idx_drivers_available_search)
   */
  getAvailableCount: (db, tenantId, vehicleType) => {
    return db('drivers')
      .count('* as count')
      .where({
        tenant_id: tenantId,
        vehicle_type: vehicleType,
        status: 'available'
      })
      .first();
  },

  /**
   * Get available drivers with location (uses idx_drivers_with_location)
   */
  getAvailableWithLocation: (db, tenantId, vehicleType, limit = 50) => {
    return db('drivers')
      .select('id', 'user_id', 'tenant_id', 'vehicle_type', 'vehicle_number',
              'status', 'rating', 'total_trips', 'current_latitude', 
              'current_longitude', 'location_updated_at')
      .where({
        tenant_id: tenantId,
        status: 'available',
        vehicle_type: vehicleType
      })
      .whereNotNull('current_latitude')
      .whereNotNull('current_longitude')
      .orderBy('rating', 'desc')
      .limit(limit);
  },

  /**
   * Find available drivers nearby with Haversine formula
   * Optimized query using indexes
   */
  findNearby: (db, tenantId, lat, lng, radiusKm, vehicleType, limit = 10) => {
    return db('drivers')
      .select('*')
      .select(db.raw(`
        (6371 * acos(cos(radians(?)) * cos(radians(current_latitude)) * 
        cos(radians(current_longitude) - radians(?)) + sin(radians(?)) * 
        sin(radians(current_latitude)))) AS distance
      `, [lat, lng, lat]))
      .where({
        tenant_id: tenantId,
        status: 'available',
        vehicle_type: vehicleType
      })
      .whereNotNull('current_latitude')
      .whereNotNull('current_longitude')
      .having('distance', '<=', radiusKm)
      .orderBy('distance', 'asc')
      .orderBy('rating', 'desc')
      .limit(limit);
  },

  /**
   * Bulk update driver locations (for batch processing)
   */
  bulkUpdateLocations: async (db, updates) => {
    if (updates.length === 0) return;
    
    // Use transaction for bulk update
    await db.transaction(async (trx) => {
      for (const update of updates) {
        await trx('drivers')
          .where({ id: update.id })
          .update({
            current_latitude: update.latitude,
            current_longitude: update.longitude,
            location_updated_at: new Date(),
            updated_at: new Date()
          });
      }
    });
  },

  /**
   * Get driver stats from summary table
   */
  getDriverStats: (db, driverId) => {
    return db('driver_stats_summary')
      .where({ id: driverId })
      .first();
  },

  /**
   * Get top drivers by rating (uses idx_drivers_tenant_status)
   */
  getTopDrivers: (db, tenantId, limit = 10) => {
    return db('drivers')
      .select('*')
      .where({ tenant_id: tenantId })
      .whereIn('status', ['available', 'busy'])
      .orderBy('rating', 'desc')
      .orderBy('total_trips', 'desc')
      .limit(limit);
  }
};

/**
 * Optimized trip queries
 */
export const TripQueries = {
  /**
   * Get driver trips with pagination (uses idx_trips_driver_date)
   */
  getDriverTrips: (db, driverId, limit = 20, offset = 0) => {
    return db('trips')
      .select('id', 'ride_id', 'driver_id', 'status', 'total_fare', 
              'start_time', 'end_time', 'created_at')
      .where({ driver_id: driverId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get completed trips for earnings calculation
   */
  getCompletedTrips: (db, driverId, startDate, endDate) => {
    return db('trips')
      .select('*')
      .where({ driver_id: driverId, status: 'completed' })
      .whereBetween('created_at', [startDate, endDate])
      .orderBy('created_at', 'desc');
  },

  /**
   * Calculate driver earnings for period
   */
  calculateEarnings: (db, driverId, startDate, endDate) => {
    return db('trips')
      .sum('total_fare as total')
      .count('* as trip_count')
      .avg('total_fare as average')
      .where({ driver_id: driverId, status: 'completed' })
      .whereBetween('created_at', [startDate, endDate])
      .first();
  }
};

/**
 * Optimized payment queries
 */
export const PaymentQueries = {
  /**
   * Get payments by trip (uses idx_payments_trip_status)
   */
  getByTrip: (db, tripId) => {
    return db('payments')
      .select('*')
      .where({ trip_id: tripId })
      .orderBy('created_at', 'desc');
  },

  /**
   * Get pending payments (uses idx_payments_pending)
   */
  getPending: (db, limit = 100) => {
    return db('payments')
      .select('*')
      .where({ status: 'pending' })
      .orderBy('created_at', 'asc')
      .limit(limit);
  },

  /**
   * Batch update payment status
   */
  batchUpdateStatus: async (db, paymentIds, status) => {
    if (paymentIds.length === 0) return 0;
    return db('payments')
      .whereIn('id', paymentIds)
      .update({ status, updated_at: new Date() });
  }
};

/**
 * Analytics and reporting queries
 */
export const AnalyticsQueries = {
  /**
   * Get ride statistics for date range
   */
  getRideStats: (db, tenantId, startDate, endDate) => {
    return db('ride_stats_summary')
      .select('*')
      .where({ tenant_id: tenantId })
      .whereBetween('date_key', [startDate, endDate])
      .orderBy('date_key', 'desc');
  },

  /**
   * Get driver leaderboard
   */
  getDriverLeaderboard: (db, tenantId, limit = 10) => {
    return db('driver_stats_summary')
      .select('*')
      .where({ tenant_id: tenantId })
      .orderBy('total_earnings_today', 'desc')
      .limit(limit);
  },

  /**
   * Get hourly metrics
   */
  getHourlyMetrics: (db, tenantId, metricType, hours = 24) => {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return db('hourly_metrics')
      .select('*')
      .where({ tenant_id: tenantId, metric_type: metricType })
      .where('hour_key', '>=', startTime)
      .orderBy('hour_key', 'desc');
  }
};

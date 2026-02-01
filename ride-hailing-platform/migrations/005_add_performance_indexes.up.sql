-- Migration: 005_add_performance_indexes.up.sql
-- Purpose: Add performance indexes for Phase 3 optimization
-- Database: MySQL 8.0

-- ========================================
-- RIDES TABLE INDEXES
-- ========================================

-- Index for ride queries by rider with pagination
-- Covers: getRidesByRider, getRecentRidesByRider
CREATE INDEX idx_rides_rider_created_status 
ON rides (rider_id, created_at DESC, status);

-- Index for ride status lookups
CREATE INDEX idx_rides_status_tenant
ON rides (tenant_id, status);

-- Index for rides needing driver assignment
CREATE INDEX idx_rides_searching_driver
ON rides (status, created_at)
WHERE status = 'searching_driver';

-- Index for idempotency checks (faster lookups)
CREATE INDEX idx_rides_idempotency_key
ON rides (idempotency_key);

-- Index for active rides (non-terminal states)
CREATE INDEX idx_rides_active
ON rides (tenant_id, status, updated_at)
WHERE status NOT IN ('completed', 'cancelled');

-- ========================================
-- DRIVERS TABLE INDEXES
-- ========================================

-- Index for driver queries by tenant and status
CREATE INDEX idx_drivers_tenant_status
ON drivers (tenant_id, status);

-- Composite index for available driver searches
-- Covers: findAvailableDrivers with vehicle type filtering
CREATE INDEX idx_drivers_available_search
ON drivers (tenant_id, status, vehicle_type, rating DESC);

-- Index for driver location-based queries
-- Note: MySQL doesn't support partial indexes directly, using computed column
CREATE INDEX idx_drivers_with_location
ON drivers (tenant_id, status, current_latitude, current_longitude);

-- Index for driver lookup by user
CREATE INDEX idx_drivers_user_tenant
ON drivers (user_id, tenant_id);

-- ========================================
-- TRIPS TABLE INDEXES
-- ========================================

-- Index for trip queries by driver
CREATE INDEX idx_trips_driver_date
ON trips (driver_id, created_at DESC);

-- Index for trip queries by ride
CREATE INDEX idx_trips_ride
ON trips (ride_id);

-- Index for completed trips (for statistics)
CREATE INDEX idx_trips_completed
ON trips (driver_id, status, created_at)
WHERE status = 'completed';

-- Index for trip earnings queries
CREATE INDEX idx_trips_earnings
ON trips (driver_id, status, total_fare, created_at DESC);

-- ========================================
-- PAYMENTS TABLE INDEXES
-- ========================================

-- Index for payment queries by trip
CREATE INDEX idx_payments_trip_status
ON payments (trip_id, status, created_at DESC);

-- Index for payment status lookups
CREATE INDEX idx_payments_status
ON payments (status, created_at DESC);

-- Index for pending payments
CREATE INDEX idx_payments_pending
ON payments (status, created_at)
WHERE status = 'pending';

-- ========================================
-- USERS TABLE INDEXES
-- ========================================

-- Index for user lookups by email within tenant
CREATE INDEX idx_users_email_tenant
ON users (email, tenant_id);

-- Index for user phone lookups
CREATE INDEX idx_users_phone_tenant
ON users (phone, tenant_id);

-- ========================================
-- STATISTICS
-- ========================================

-- Update table statistics for optimizer
ANALYZE TABLE rides;
ANALYZE TABLE drivers;
ANALYZE TABLE trips;
ANALYZE TABLE payments;
ANALYZE TABLE users;

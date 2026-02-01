-- Migration: 006_add_summary_tables.up.sql
-- Purpose: Add summary tables for analytics and statistics (MySQL equivalent of materialized views)
-- Database: MySQL 8.0
-- Note: MySQL doesn't support native materialized views, so we use summary tables with scheduled refresh

-- ========================================
-- DRIVER STATISTICS SUMMARY TABLE
-- ========================================

-- Create summary table for driver statistics
CREATE TABLE IF NOT EXISTS driver_stats_summary (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    rating DECIMAL(3,2) DEFAULT 5.00,
    total_trips INT DEFAULT 0,
    completed_trips_today INT DEFAULT 0,
    avg_fare DECIMAL(10,2) DEFAULT 0.00,
    total_earnings_today DECIMAL(12,2) DEFAULT 0.00,
    total_earnings_week DECIMAL(12,2) DEFAULT 0.00,
    total_earnings_month DECIMAL(12,2) DEFAULT 0.00,
    last_trip_at DATETIME NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_stats_tenant_rating (tenant_id, rating DESC),
    INDEX idx_stats_tenant (tenant_id),
    INDEX idx_stats_earnings (total_earnings_today DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- PROCEDURE TO REFRESH DRIVER STATS
-- ========================================

DELIMITER //

CREATE PROCEDURE RefreshDriverStats()
BEGIN
    -- Use INSERT ... ON DUPLICATE KEY UPDATE for upsert behavior
    INSERT INTO driver_stats_summary (
        id, tenant_id, rating, total_trips,
        completed_trips_today, avg_fare, total_earnings_today,
        total_earnings_week, total_earnings_month, last_trip_at, last_updated
    )
    SELECT 
        d.id,
        d.tenant_id,
        d.rating,
        d.total_trips,
        COALESCE(today_stats.trips_today, 0) as completed_trips_today,
        COALESCE(today_stats.avg_fare_today, 0) as avg_fare,
        COALESCE(today_stats.earnings_today, 0) as total_earnings_today,
        COALESCE(week_stats.earnings_week, 0) as total_earnings_week,
        COALESCE(month_stats.earnings_month, 0) as total_earnings_month,
        today_stats.last_trip_at,
        NOW() as last_updated
    FROM drivers d
    LEFT JOIN (
        SELECT 
            driver_id,
            COUNT(*) as trips_today,
            AVG(total_fare) as avg_fare_today,
            SUM(total_fare) as earnings_today,
            MAX(created_at) as last_trip_at
        FROM trips 
        WHERE status = 'completed' 
          AND DATE(created_at) = CURDATE()
        GROUP BY driver_id
    ) today_stats ON d.id = today_stats.driver_id
    LEFT JOIN (
        SELECT 
            driver_id,
            SUM(total_fare) as earnings_week
        FROM trips 
        WHERE status = 'completed' 
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY driver_id
    ) week_stats ON d.id = week_stats.driver_id
    LEFT JOIN (
        SELECT 
            driver_id,
            SUM(total_fare) as earnings_month
        FROM trips 
        WHERE status = 'completed' 
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY driver_id
    ) month_stats ON d.id = month_stats.driver_id
    ON DUPLICATE KEY UPDATE
        rating = VALUES(rating),
        total_trips = VALUES(total_trips),
        completed_trips_today = VALUES(completed_trips_today),
        avg_fare = VALUES(avg_fare),
        total_earnings_today = VALUES(total_earnings_today),
        total_earnings_week = VALUES(total_earnings_week),
        total_earnings_month = VALUES(total_earnings_month),
        last_trip_at = VALUES(last_trip_at),
        last_updated = VALUES(last_updated);
END //

DELIMITER ;

-- ========================================
-- RIDE STATISTICS SUMMARY TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS ride_stats_summary (
    date_key DATE NOT NULL,
    tenant_id VARCHAR(100) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL,
    total_rides INT DEFAULT 0,
    completed_rides INT DEFAULT 0,
    cancelled_rides INT DEFAULT 0,
    avg_fare DECIMAL(10,2) DEFAULT 0.00,
    total_revenue DECIMAL(12,2) DEFAULT 0.00,
    avg_wait_time_seconds INT DEFAULT 0,
    avg_trip_duration_seconds INT DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (date_key, tenant_id, vehicle_type),
    INDEX idx_ride_stats_tenant_date (tenant_id, date_key DESC),
    INDEX idx_ride_stats_revenue (total_revenue DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- PROCEDURE TO REFRESH RIDE STATS
-- ========================================

DELIMITER //

CREATE PROCEDURE RefreshRideStats(IN target_date DATE)
BEGIN
    DECLARE calc_date DATE;
    SET calc_date = IFNULL(target_date, CURDATE());
    
    INSERT INTO ride_stats_summary (
        date_key, tenant_id, vehicle_type,
        total_rides, completed_rides, cancelled_rides,
        avg_fare, total_revenue, avg_wait_time_seconds,
        avg_trip_duration_seconds, last_updated
    )
    SELECT 
        DATE(r.created_at) as date_key,
        r.tenant_id,
        r.vehicle_type,
        COUNT(*) as total_rides,
        SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) as completed_rides,
        SUM(CASE WHEN r.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_rides,
        AVG(CASE WHEN r.status = 'completed' THEN r.estimated_fare ELSE NULL END) as avg_fare,
        SUM(CASE WHEN r.status = 'completed' THEN r.estimated_fare ELSE 0 END) as total_revenue,
        AVG(TIMESTAMPDIFF(SECOND, r.requested_at, r.assigned_at)) as avg_wait_time_seconds,
        AVG(CASE 
            WHEN t.id IS NOT NULL AND t.end_time IS NOT NULL 
            THEN TIMESTAMPDIFF(SECOND, t.start_time, t.end_time) 
            ELSE NULL 
        END) as avg_trip_duration_seconds,
        NOW() as last_updated
    FROM rides r
    LEFT JOIN trips t ON r.id = t.ride_id
    WHERE DATE(r.created_at) = calc_date
    GROUP BY DATE(r.created_at), r.tenant_id, r.vehicle_type
    ON DUPLICATE KEY UPDATE
        total_rides = VALUES(total_rides),
        completed_rides = VALUES(completed_rides),
        cancelled_rides = VALUES(cancelled_rides),
        avg_fare = VALUES(avg_fare),
        total_revenue = VALUES(total_revenue),
        avg_wait_time_seconds = VALUES(avg_wait_time_seconds),
        avg_trip_duration_seconds = VALUES(avg_trip_duration_seconds),
        last_updated = VALUES(last_updated);
END //

DELIMITER ;

-- ========================================
-- HOURLY METRICS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS hourly_metrics (
    hour_key DATETIME NOT NULL,
    tenant_id VARCHAR(100) NOT NULL,
    metric_type VARCHAR(50) NOT NULL,
    metric_value DECIMAL(12,4) DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (hour_key, tenant_id, metric_type),
    INDEX idx_hourly_tenant_type (tenant_id, metric_type, hour_key DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- VIEWS FOR COMMON QUERIES
-- ========================================

-- View for active drivers with stats
CREATE OR REPLACE VIEW v_active_drivers AS
SELECT 
    d.id,
    d.tenant_id,
    d.user_id,
    d.vehicle_type,
    d.vehicle_number,
    d.status,
    d.rating,
    d.total_trips,
    d.current_latitude,
    d.current_longitude,
    d.location_updated_at,
    COALESCE(s.completed_trips_today, 0) as trips_today,
    COALESCE(s.total_earnings_today, 0) as earnings_today
FROM drivers d
LEFT JOIN driver_stats_summary s ON d.id = s.id
WHERE d.status IN ('available', 'busy', 'on_trip');

-- View for ride dashboard
CREATE OR REPLACE VIEW v_ride_dashboard AS
SELECT 
    r.id,
    r.tenant_id,
    r.rider_id,
    r.driver_id,
    r.status,
    r.vehicle_type,
    r.estimated_fare,
    r.created_at,
    r.assigned_at,
    d.vehicle_number as driver_vehicle,
    d.rating as driver_rating,
    TIMESTAMPDIFF(SECOND, r.requested_at, IFNULL(r.assigned_at, NOW())) as wait_seconds
FROM rides r
LEFT JOIN drivers d ON r.driver_id = d.id
WHERE r.status NOT IN ('completed', 'cancelled');

-- View for payment reconciliation
CREATE OR REPLACE VIEW v_payment_summary AS
SELECT 
    DATE(p.created_at) as payment_date,
    p.tenant_id,
    p.payment_method,
    p.status,
    COUNT(*) as payment_count,
    SUM(p.amount) as total_amount
FROM payments p
GROUP BY DATE(p.created_at), p.tenant_id, p.payment_method, p.status;

-- ========================================
-- EVENT SCHEDULER FOR AUTO-REFRESH
-- ========================================

-- Note: Make sure event_scheduler is ON in MySQL config
-- SET GLOBAL event_scheduler = ON;

-- Refresh driver stats every 5 minutes
CREATE EVENT IF NOT EXISTS evt_refresh_driver_stats
ON SCHEDULE EVERY 5 MINUTE
STARTS CURRENT_TIMESTAMP
DO
    CALL RefreshDriverStats();

-- Refresh ride stats every hour for current day
CREATE EVENT IF NOT EXISTS evt_refresh_ride_stats
ON SCHEDULE EVERY 1 HOUR
STARTS CURRENT_TIMESTAMP
DO
    CALL RefreshRideStats(CURDATE());

-- Backfill previous day stats at midnight
CREATE EVENT IF NOT EXISTS evt_refresh_previous_day_stats
ON SCHEDULE EVERY 1 DAY
STARTS (TIMESTAMP(CURRENT_DATE) + INTERVAL 1 DAY + INTERVAL 5 MINUTE)
DO
    CALL RefreshRideStats(DATE_SUB(CURDATE(), INTERVAL 1 DAY));

-- 003_create_rides_table.up.sql
CREATE TABLE IF NOT EXISTS rides (
    id CHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    rider_id CHAR(36) NOT NULL,
    driver_id CHAR(36),
    status ENUM('requested', 'searching_driver', 'driver_assigned', 'driver_arriving', 'trip_started', 'completed', 'cancelled') NOT NULL DEFAULT 'requested',
    vehicle_type ENUM('economy', 'premium', 'luxury') NOT NULL,
    pickup_latitude DECIMAL(10, 8) NOT NULL,
    pickup_longitude DECIMAL(11, 8) NOT NULL,
    pickup_address TEXT NOT NULL,
    dropoff_latitude DECIMAL(10, 8) NOT NULL,
    dropoff_longitude DECIMAL(11, 8) NOT NULL,
    dropoff_address TEXT NOT NULL,
    estimated_fare DECIMAL(10, 2),
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_at TIMESTAMP NULL,
    cancelled_at TIMESTAMP NULL,
    cancellation_reason TEXT,
    idempotency_key VARCHAR(100),
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE INDEX idx_rides_idempotency (idempotency_key),
    INDEX idx_rides_rider (rider_id, created_at DESC),
    INDEX idx_rides_driver (driver_id, created_at DESC),
    INDEX idx_rides_status (status, tenant_id),
    INDEX idx_rides_tenant (tenant_id),
    
    CONSTRAINT fk_rides_rider FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_rides_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

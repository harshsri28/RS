-- 004_create_trips_and_payments.up.sql
CREATE TABLE IF NOT EXISTS trips (
    id CHAR(36) PRIMARY KEY,
    ride_id CHAR(36) NOT NULL,
    driver_id CHAR(36) NOT NULL,
    rider_id CHAR(36) NOT NULL,
    status ENUM('started', 'in_progress', 'paused', 'ended', 'completed') NOT NULL DEFAULT 'started',
    start_latitude DECIMAL(10, 8) NOT NULL,
    start_longitude DECIMAL(11, 8) NOT NULL,
    end_latitude DECIMAL(10, 8),
    end_longitude DECIMAL(11, 8),
    start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP NULL,
    distance_km DECIMAL(10, 2),
    duration_minutes INT,
    base_fare DECIMAL(10, 2),
    distance_fare DECIMAL(10, 2),
    time_fare DECIMAL(10, 2),
    surge_multiplier DECIMAL(4, 2) DEFAULT 1.00,
    total_fare DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'INR',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_trips_ride (ride_id),
    INDEX idx_trips_driver (driver_id, created_at DESC),
    INDEX idx_trips_rider (rider_id, created_at DESC),
    INDEX idx_trips_status (status),
    
    CONSTRAINT fk_trips_ride FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
    CONSTRAINT fk_trips_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
    CONSTRAINT fk_trips_rider FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
    id CHAR(36) PRIMARY KEY,
    trip_id CHAR(36) NOT NULL,
    rider_id CHAR(36) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status ENUM('pending', 'processing', 'succeeded', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(50) NOT NULL,
    psp_name VARCHAR(50) NOT NULL,
    psp_transaction_id VARCHAR(100),
    failure_reason TEXT,
    idempotency_key VARCHAR(100) NOT NULL,
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE INDEX idx_payments_idempotency (idempotency_key),
    INDEX idx_payments_trip (trip_id),
    INDEX idx_payments_rider (rider_id),
    INDEX idx_payments_status (status),
    
    CONSTRAINT fk_payments_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    CONSTRAINT fk_payments_rider FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

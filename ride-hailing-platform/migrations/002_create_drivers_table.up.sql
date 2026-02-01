-- 002_create_drivers_table.up.sql
CREATE TABLE IF NOT EXISTS drivers (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    tenant_id VARCHAR(50) NOT NULL,
    vehicle_type ENUM('economy', 'premium', 'luxury') NOT NULL,
    vehicle_number VARCHAR(20) NOT NULL,
    license_number VARCHAR(50) NOT NULL,
    status ENUM('offline', 'available', 'busy', 'on_trip') NOT NULL DEFAULT 'offline',
    current_latitude DECIMAL(10, 8),
    current_longitude DECIMAL(11, 8),
    location_updated_at TIMESTAMP NULL,
    rating DECIMAL(3, 2) DEFAULT 5.00,
    total_trips INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_drivers_user (user_id),
    INDEX idx_drivers_status (status),
    INDEX idx_drivers_tenant (tenant_id),
    INDEX idx_drivers_vehicle_type (vehicle_type),
    INDEX idx_drivers_location (current_latitude, current_longitude),
    
    CONSTRAINT fk_drivers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

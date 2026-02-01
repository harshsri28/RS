#!/bin/bash

echo "=== Phase 2 Integration Tests ==="
echo ""

BASE_URL="http://localhost:8080"
TENANT_ID="tenant-001"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function
check_service() {
    local name=$1
    local url=$2
    local max_retries=${3:-30}
    local retry=0
    
    echo -n "Waiting for $name..."
    while [ $retry -lt $max_retries ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            echo -e " ${GREEN}Ready${NC}"
            return 0
        fi
        retry=$((retry + 1))
        sleep 1
        echo -n "."
    done
    echo -e " ${RED}Failed${NC}"
    return 1
}

echo "Step 1: Starting services..."
docker-compose up -d

echo ""
echo "Step 2: Waiting for services to be healthy..."

# Wait for MySQL
check_service "MySQL" "localhost:3306" 60

# Wait for Redis
check_service "Redis" "localhost:6379" 30

# Wait for RabbitMQ
check_service "RabbitMQ" "http://localhost:15672" 60

# Wait for Temporal
check_service "Temporal" "http://localhost:7233" 90

# Wait for API
check_service "API" "$BASE_URL/health" 60

echo ""
echo "Step 3: Creating test data..."

# Create a test user
echo "Creating test user..."
USER_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/users" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -d '{
    "name": "Test Rider",
    "email": "rider@test.com",
    "phone": "+1234567890"
  }')
echo "User Response: $USER_RESPONSE"
USER_ID=$(echo $USER_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

# Create a test driver
echo ""
echo "Creating test driver..."
DRIVER_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/drivers" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -d '{
    "user_id": "'"$USER_ID"'",
    "vehicle_type": "economy",
    "vehicle_number": "ABC-1234",
    "license_number": "DL12345678"
  }')
echo "Driver Response: $DRIVER_RESPONSE"
DRIVER_ID=$(echo $DRIVER_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

# Update driver location and make available
echo ""
echo "Setting driver location and status..."
curl -s -X PUT "$BASE_URL/v1/drivers/$DRIVER_ID/location" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -d '{
    "latitude": 12.9716,
    "longitude": 77.5946,
    "status": "available"
  }'

echo ""
echo "Step 4: Creating test ride..."
RIDE_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/rides" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -H "Idempotency-Key: test-phase2-$(date +%s)" \
  -d '{
    "rider_id": "'"$USER_ID"'",
    "pickup_location": {
      "latitude": 12.9716,
      "longitude": 77.5946
    },
    "dropoff_location": {
      "latitude": 12.2958,
      "longitude": 76.6394
    },
    "vehicle_type": "economy",
    "payment_method": "card"
  }')

echo "Ride Response: $RIDE_RESPONSE"
RIDE_ID=$(echo $RIDE_RESPONSE | grep -o '"rideId":"[^"]*"' | cut -d'"' -f4)

echo ""
echo "Step 5: Checking RabbitMQ queue..."
sleep 2
QUEUE_INFO=$(curl -s -u admin:admin "http://localhost:15672/api/queues/%2F/driver.matching")
MESSAGES=$(echo $QUEUE_INFO | grep -o '"messages":[0-9]*' | cut -d':' -f2)
echo "Messages in driver.matching queue: $MESSAGES"

echo ""
echo "Step 6: Checking Temporal UI..."
echo "Temporal UI available at: http://localhost:8088"
echo "Look for workflow ID: ride-matching-$RIDE_ID"

echo ""
echo "Step 7: Checking ride status after 10 seconds..."
sleep 10
RIDE_STATUS=$(curl -s -X GET "$BASE_URL/v1/rides/$RIDE_ID" \
  -H "X-Tenant-ID: $TENANT_ID")
echo "Ride Status: $RIDE_STATUS"

echo ""
echo "=== Phase 2 Test Summary ==="
echo "- RabbitMQ Management UI: http://localhost:15672 (admin/admin)"
echo "- Temporal UI: http://localhost:8088"
echo "- API: $BASE_URL"
echo ""
echo "Test ride ID: $RIDE_ID"
echo "Test driver ID: $DRIVER_ID"
echo ""
echo -e "${GREEN}Phase 2 integration tests completed!${NC}"
echo ""
echo "To clean up, run: docker-compose down -v"

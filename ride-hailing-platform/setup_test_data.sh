#!/bin/bash

# Phase 2 Test Data Setup Script
# Creates multiple users (riders) and drivers for testing

BASE_URL="http://localhost:8080"
TENANT_ID="tenant-001"

echo "=== Creating Test Data for Phase 2 ==="
echo ""

# Arrays to store IDs
declare -a USER_IDS
declare -a DRIVER_IDS

# Create 5 riders
echo "--- Creating Riders ---"
for i in {1..5}; do
  RESPONSE=$(curl -s -X POST "$BASE_URL/v1/users" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: $TENANT_ID" \
    -H "Idempotency-Key: rider-$i-$(date +%s)" \
    -d "{
      \"name\": \"Rider $i\",
      \"email\": \"rider$i@test.com\",
      \"phone\": \"+123456789$i\"
    }")
  
  USER_ID=$(echo $RESPONSE | sed 's/.*"id":"\([^"]*\)".*/\1/')
  USER_IDS+=("$USER_ID")
  echo "Created Rider $i: $USER_ID"
done

echo ""
echo "--- Creating Driver Users ---"

# Create 5 driver users
declare -a DRIVER_USER_IDS
for i in {1..5}; do
  RESPONSE=$(curl -s -X POST "$BASE_URL/v1/users" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: $TENANT_ID" \
    -H "Idempotency-Key: driveruser-$i-$(date +%s)" \
    -d "{
      \"name\": \"Driver User $i\",
      \"email\": \"driver$i@test.com\",
      \"phone\": \"+198765432$i\"
    }")
  
  USER_ID=$(echo $RESPONSE | sed 's/.*"id":"\([^"]*\)".*/\1/')
  DRIVER_USER_IDS+=("$USER_ID")
  echo "Created Driver User $i: $USER_ID"
done

echo ""
echo "--- Creating Drivers ---"

# Vehicle types
VEHICLE_TYPES=("economy" "economy" "premium" "premium" "luxury")

# Create 5 drivers with different vehicle types
for i in {0..4}; do
  idx=$((i+1))
  RESPONSE=$(curl -s -X POST "$BASE_URL/v1/drivers" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: $TENANT_ID" \
    -H "Idempotency-Key: driver-$idx-$(date +%s)" \
    -d "{
      \"user_id\": \"${DRIVER_USER_IDS[$i]}\",
      \"vehicle_type\": \"${VEHICLE_TYPES[$i]}\",
      \"vehicle_number\": \"KA-0$idx-AB-123$idx\",
      \"license_number\": \"DL$idx$idx$idx$idx$idx$idx$idx$idx\"
    }")
  
  DRIVER_ID=$(echo $RESPONSE | sed 's/.*"id":"\([^"]*\)".*/\1/')
  DRIVER_IDS+=("$DRIVER_ID")
  echo "Created Driver $idx (${VEHICLE_TYPES[$i]}): $DRIVER_ID"
  sleep 1
done

echo ""
echo "--- Setting Driver Locations (Bangalore area) ---"

# Bangalore coordinates with slight variations
LATITUDES=(12.9716 12.9352 12.9141 12.9698 12.9260)
LONGITUDES=(77.5946 77.6245 77.6411 77.7499 77.5510)

for i in {0..4}; do
  idx=$((i+1))
  curl -s -X PUT "$BASE_URL/v1/drivers/${DRIVER_IDS[$i]}/location" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: $TENANT_ID" \
    -d "{
      \"latitude\": ${LATITUDES[$i]},
      \"longitude\": ${LONGITUDES[$i]},
      \"status\": \"available\"
    }" > /dev/null
  
  echo "Driver $idx location set: (${LATITUDES[$i]}, ${LONGITUDES[$i]}) - Status: available"
done

echo ""
echo "=== Test Data Created Successfully ==="
echo ""
echo "--- Summary ---"
echo "Riders (5):"
for i in {0..4}; do
  idx=$((i+1))
  echo "  Rider $idx: ${USER_IDS[$i]}"
done

echo ""
echo "Drivers (5):"
for i in {0..4}; do
  idx=$((i+1))
  echo "  Driver $idx (${VEHICLE_TYPES[$i]}): ${DRIVER_IDS[$i]}"
done

echo ""
echo "=== Ready for Testing ==="
echo ""
echo "Example: Create a ride with Rider 1"
echo ""
echo "curl -X POST $BASE_URL/v1/rides \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -H \"X-Tenant-ID: $TENANT_ID\" \\"
echo "  -H \"Idempotency-Key: test-\$(date +%s)\" \\"
echo "  -d '{"
echo "    \"rider_id\": \"${USER_IDS[0]}\","
echo "    \"pickup_location\": {\"latitude\": 12.9716, \"longitude\": 77.5946},"
echo "    \"dropoff_location\": {\"latitude\": 12.2958, \"longitude\": 76.6394},"
echo "    \"vehicle_type\": \"economy\","
echo "    \"payment_method\": \"card\""
echo "  }'"
echo ""
echo "Monitor workflows at: http://localhost:8088"
echo "RabbitMQ Management: http://localhost:15672 (admin/admin)"

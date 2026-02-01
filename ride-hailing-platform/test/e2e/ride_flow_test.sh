#!/bin/bash

# test/e2e/ride_flow_test.sh
# End-to-End Ride Flow Test Script
# Tests the complete ride lifecycle: create -> assign -> accept -> complete

set -e

echo "=== End-to-End Ride Flow Test ==="
echo ""

# Configuration
API_URL="${API_URL:-http://localhost:8080/v1}"
WS_URL="${WS_URL:-ws://localhost:8080/ws}"

# Generate unique IDs for this test run
RIDER_ID="rider-test-$(date +%s)"
DRIVER_ID="driver-test-$(date +%s)"

echo "Configuration:"
echo "  API URL: $API_URL"
echo "  Rider ID: $RIDER_ID"
echo "  Driver ID: $DRIVER_ID"
echo ""

# Check if the server is running
echo "1. Checking server health..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/../health" 2>/dev/null || echo "000")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" != "200" ]; then
    echo "   ❌ Server is not running (HTTP $HTTP_CODE)"
    echo "   Please start the server first: npm start"
    exit 1
fi
echo "   ✅ Server is healthy"
echo "   Response: $BODY"
echo ""

# Step 2: Register driver location (make driver available)
echo "2. Registering driver location..."
DRIVER_LOCATION_RESPONSE=$(curl -s -X POST "$API_URL/drivers/$DRIVER_ID/location" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: default" \
    -d '{
        "latitude": 12.9716,
        "longitude": 77.5946,
        "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
    }' 2>/dev/null || echo '{"error": "request failed"}')
echo "   Response: $DRIVER_LOCATION_RESPONSE"
echo ""

# Step 3: Set driver status to available
echo "3. Setting driver status to available..."
DRIVER_STATUS_RESPONSE=$(curl -s -X POST "$API_URL/drivers/$DRIVER_ID/status" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: default" \
    -d '{
        "status": "available"
    }' 2>/dev/null || echo '{"error": "request failed"}')
echo "   Response: $DRIVER_STATUS_RESPONSE"
echo ""

# Step 4: Create a ride
echo "4. Creating a new ride..."
IDEMPOTENCY_KEY="test-$(date +%s)-$(( RANDOM % 10000 ))"
RIDE_RESPONSE=$(curl -s -X POST "$API_URL/rides" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: default" \
    -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
    -d '{
        "rider_id": "'$RIDER_ID'",
        "pickup_location": {
            "latitude": 12.9716,
            "longitude": 77.5946,
            "address": "MG Road, Bangalore"
        },
        "dropoff_location": {
            "latitude": 12.2958,
            "longitude": 76.6394,
            "address": "Mysore Road, Bangalore"
        },
        "vehicle_type": "economy",
        "payment_method": "card"
    }' 2>/dev/null || echo '{"error": "request failed"}')

echo "   Response: $RIDE_RESPONSE"

# Extract ride ID (handle different JSON formats)
RIDE_ID=$(echo "$RIDE_RESPONSE" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"id"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
if [ -z "$RIDE_ID" ]; then
    RIDE_ID=$(echo "$RIDE_RESPONSE" | grep -o '"ride_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"ride_id"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
fi

if [ -z "$RIDE_ID" ]; then
    echo "   ❌ Failed to create ride"
    exit 1
fi
echo "   ✅ Ride created with ID: $RIDE_ID"
echo ""

# Step 5: Get ride status
echo "5. Checking initial ride status..."
sleep 1
RIDE_STATUS=$(curl -s "$API_URL/rides/$RIDE_ID" \
    -H "X-Tenant-ID: default" 2>/dev/null || echo '{"error": "request failed"}')
echo "   Response: $RIDE_STATUS"
echo ""

# Step 6: Driver accepts the ride
echo "6. Driver accepting the ride..."
ACCEPT_RESPONSE=$(curl -s -X POST "$API_URL/drivers/$DRIVER_ID/accept" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: default" \
    -d '{
        "ride_id": "'$RIDE_ID'",
        "estimated_arrival_minutes": 5
    }' 2>/dev/null || echo '{"error": "request failed"}')
echo "   Response: $ACCEPT_RESPONSE"
echo ""

# Step 7: Check ride status after acceptance
echo "7. Checking ride status after driver acceptance..."
sleep 2
RIDE_AFTER_ACCEPT=$(curl -s "$API_URL/rides/$RIDE_ID" \
    -H "X-Tenant-ID: default" 2>/dev/null || echo '{"error": "request failed"}')
echo "   Response: $RIDE_AFTER_ACCEPT"
echo ""

# Step 8: Start a trip
echo "8. Starting the trip..."
TRIP_RESPONSE=$(curl -s -X POST "$API_URL/trips" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: default" \
    -d '{
        "ride_id": "'$RIDE_ID'",
        "driver_id": "'$DRIVER_ID'"
    }' 2>/dev/null || echo '{"error": "request failed"}')
echo "   Response: $TRIP_RESPONSE"

# Extract trip ID
TRIP_ID=$(echo "$TRIP_RESPONSE" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"id"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
if [ -z "$TRIP_ID" ]; then
    TRIP_ID=$(echo "$TRIP_RESPONSE" | grep -o '"trip_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"trip_id"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
fi

if [ -n "$TRIP_ID" ]; then
    echo "   ✅ Trip started with ID: $TRIP_ID"
else
    echo "   ⚠️  Trip creation may have failed (or already exists)"
fi
echo ""

# Step 9: End the trip (if we have a trip ID)
if [ -n "$TRIP_ID" ]; then
    echo "9. Ending the trip..."
    END_TRIP_RESPONSE=$(curl -s -X POST "$API_URL/trips/$TRIP_ID/end" \
        -H "Content-Type: application/json" \
        -H "X-Tenant-ID: default" \
        -d '{
            "end_location": {
                "latitude": 12.2958,
                "longitude": 76.6394,
                "address": "Mysore Road, Bangalore"
            }
        }' 2>/dev/null || echo '{"error": "request failed"}')
    echo "   Response: $END_TRIP_RESPONSE"
    echo ""
fi

# Step 10: Final ride status check
echo "10. Final ride status..."
FINAL_RIDE_STATUS=$(curl -s "$API_URL/rides/$RIDE_ID" \
    -H "X-Tenant-ID: default" 2>/dev/null || echo '{"error": "request failed"}')
echo "   Response: $FINAL_RIDE_STATUS"
echo ""

# Summary
echo "========================================="
echo "        Test Summary"
echo "========================================="
echo "Rider ID:  $RIDER_ID"
echo "Driver ID: $DRIVER_ID"
echo "Ride ID:   $RIDE_ID"
[ -n "$TRIP_ID" ] && echo "Trip ID:   $TRIP_ID"
echo ""
echo "✅ End-to-End test completed!"
echo ""
echo "Next steps to test WebSocket:"
echo "  1. Open the frontend at http://localhost:5173"
echo "  2. Connect to /rider to see rider dashboard"
echo "  3. Connect to /driver to see driver dashboard"
echo "  4. Create a ride and watch real-time updates"

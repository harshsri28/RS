#!/bin/bash
BASE_URL="http://localhost:8080"
TENANT_ID="tenant-001"

# Driver IDs
DRIVERS=(
  "a6486d41-f9ef-481d-99f9-9059e59fb96e:12.9716:77.5946"
  "7fc6606d-44da-45cf-b239-dfde733ca694:12.9352:77.6245"
  "bddc364e-69c8-46bc-a1d2-2602fb1a5f1b:12.9141:77.6411"
  "38529d70-5618-495c-af4b-8d01589f8e4e:12.9698:77.7499"
  "a8f887bd-ca66-4b4e-9ce7-d6e0eeb2684c:12.9260:77.5510"
)

echo "Updating driver locations..."
idx=1
for entry in "${DRIVERS[@]}"; do
  IFS=':' read -r driver_id lat lng <<< "$entry"
  
  curl -s -X POST "$BASE_URL/v1/drivers/$driver_id/location" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: $TENANT_ID" \
    -H "Idempotency-Key: locupd-$idx-$(date +%s)" \
    -d "{\"latitude\": $lat, \"longitude\": $lng, \"status\": \"available\"}"
  
  echo "Driver $idx updated: $driver_id"
  idx=$((idx + 1))
  sleep 1
done

echo ""
echo "Verifying drivers in database..."
docker exec ridehail-mysql mysql -uroot -proot ridehail -e "SELECT id, vehicle_type, status, current_latitude, current_longitude FROM drivers WHERE tenant_id='tenant-001';" 2>/dev/null

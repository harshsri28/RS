# Ride-Hailing Platform - Backend Low-Level Design (LLD)

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Directory Structure](#2-directory-structure)
3. [Domain Models](#3-domain-models)
4. [API Endpoints - Detailed](#4-api-endpoints---detailed)
5. [Service Layer Logic](#5-service-layer-logic)
6. [Temporal Workflow - Driver Matching](#6-temporal-workflow---driver-matching)
7. [Message Queue Consumers](#7-message-queue-consumers)
8. [Fare Calculation (Strategy Pattern)](#8-fare-calculation-strategy-pattern)
9. [WebSocket Real-time Communication](#9-websocket-real-time-communication)
10. [Error Handling](#10-error-handling)
11. [Complete Flow Diagrams](#11-complete-flow-diagrams)

---

## 1. Architecture Overview

### Layered Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                      HANDLER LAYER                               │
│  ride_handler.js | driver_handler.js | trip_handler.js | ...    │
├─────────────────────────────────────────────────────────────────┤
│                      SERVICE LAYER                               │
│  RideService | DriverService | TripService | UserService        │
├─────────────────────────────────────────────────────────────────┤
│                    REPOSITORY LAYER                              │
│  RideRepository | DriverRepository | TripRepository | ...       │
├─────────────────────────────────────────────────────────────────┤
│                      DATA LAYER                                  │
│  MySQL (Knex.js) | Redis Cache | RabbitMQ | Temporal            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

```
src/
├── cmd/
│   ├── api.js              # HTTP server bootstrap
│   └── worker.js           # Background worker bootstrap
├── internal/
│   ├── api/
│   │   ├── handlers/       # HTTP request handlers
│   │   ├── middlewares/    # Express middlewares
│   │   └── router.js       # Route definitions
│   ├── config/
│   │   └── config.js       # Environment configuration
│   ├── consumers/          # RabbitMQ message consumers
│   ├── messaging/
│   │   ├── events.js       # Event definitions
│   │   └── setup.js        # RabbitMQ setup
│   ├── models/             # Domain models
│   ├── repository/         # Database access layer
│   ├── services/           # Business logic
│   │   ├── fare/           # Fare calculation strategies
│   │   └── notification/   # Notification service
│   ├── temporal/
│   │   ├── activities/     # Temporal activities
│   │   └── workflows/      # Temporal workflows
│   └── websocket/          # WebSocket hub
└── pkg/
    ├── cache/              # Redis client
    ├── database/           # MySQL client
    └── messaging/          # RabbitMQ client
```

---

## 3. Domain Models

### 3.1 User Model
```javascript
User {
  id: UUID
  tenant_id: string
  email: string (unique)
  phone: string (unique)
  name: string
  role: 'rider' | 'driver' | 'admin'
  created_at: timestamp
  updated_at: timestamp
}
```

### 3.2 Driver Model
```javascript
Driver {
  id: UUID
  user_id: UUID (FK → users)
  tenant_id: string
  vehicle_type: 'economy' | 'premium' | 'luxury'
  vehicle_number: string
  license_number: string
  status: 'offline' | 'available' | 'busy' | 'on_trip'
  current_latitude: decimal(10,8)
  current_longitude: decimal(11,8)
  location_updated_at: timestamp
  rating: decimal(3,2) [default: 5.0]
  total_trips: int [default: 0]
}
```

**Status State Machine:**
```
┌─────────┐   go online   ┌───────────┐
│ OFFLINE │──────────────>│ AVAILABLE │
└─────────┘               └─────┬─────┘
     ^                         │
     │ go offline         accept ride
     │                         │
     │                         v
     │                    ┌────┴────┐   start trip   ┌─────────┐
     └────────────────────│  BUSY   │───────────────>│ ON_TRIP │
                          └─────────┘                └────┬────┘
                               ^                          │
                               │       end trip           │
                               └──────────────────────────┘
```

### 3.3 Ride Model
```javascript
Ride {
  id: UUID
  tenant_id: string
  rider_id: UUID (FK → users)
  driver_id: UUID (FK → drivers) [nullable]
  status: RideStatus
  vehicle_type: 'economy' | 'premium' | 'luxury'
  pickup_location: { latitude, longitude, address }
  dropoff_location: { latitude, longitude, address }
  estimated_fare: decimal(10,2)
  requested_at: timestamp
  assigned_at: timestamp [nullable]
  cancelled_at: timestamp [nullable]
  cancellation_reason: text [nullable]
  idempotency_key: string [unique]
}
```

**RideStatus Enum:**
```
REQUESTED → SEARCHING_DRIVER → DRIVER_ASSIGNED → DRIVER_ARRIVING → TRIP_STARTED → COMPLETED
                                      ↓
                                 CANCELLED
```

### 3.4 Trip Model
```javascript
Trip {
  id: UUID
  ride_id: UUID (FK → rides)
  driver_id: UUID (FK → drivers)
  rider_id: UUID (FK → users)
  status: 'started' | 'in_progress' | 'paused' | 'ended' | 'completed'
  start_location: { latitude, longitude }
  end_location: { latitude, longitude } [nullable]
  start_time: timestamp
  end_time: timestamp [nullable]
  distance_km: decimal(10,2)
  duration_minutes: int
  base_fare: decimal(10,2)
  distance_fare: decimal(10,2)
  time_fare: decimal(10,2)
  surge_multiplier: decimal(4,2) [default: 1.0]
  total_fare: decimal(10,2)
  currency: 'INR'
}
```

### 3.5 Payment Model
```javascript
Payment {
  id: UUID
  trip_id: UUID (FK → trips)
  rider_id: UUID (FK → users)
  amount: decimal(10,2)
  currency: 'INR'
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded'
  payment_method: string
  psp_name: string
  psp_transaction_id: string [nullable]
  failure_reason: text [nullable]
  idempotency_key: string [unique]
}
```

---

## 4. API Endpoints - Detailed

### 4.1 Create User
```
POST /v1/users
```

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+919876543210",
  "role": "rider"
}
```

**Logic:**
1. Check if user with email already exists → Error if exists
2. Generate UUID
3. Create User object with tenant_id from header
4. Insert into database
5. Return user response

**cURL:**
```bash
curl -X POST http://localhost:8080/v1/users \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"name":"John Doe","email":"john@example.com","phone":"+919876543210","role":"rider"}'
```

---

### 4.2 Create Driver
```
POST /v1/drivers
```

**Request:**
```json
{
  "user_id": "uuid",
  "vehicle_type": "economy",
  "vehicle_number": "KA01AB1234",
  "license_number": "DL123456789"
}
```

**Logic:**
1. Validate vehicle_type is one of: economy, premium, luxury
2. Generate UUID
3. Create Driver with status = OFFLINE, rating = 5.0
4. Insert into database
5. Return driver response

**cURL:**
```bash
curl -X POST http://localhost:8080/v1/drivers \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"user_id":"<USER_ID>","vehicle_type":"economy","vehicle_number":"KA01AB1234","license_number":"DL123456789"}'
```

---

### 4.3 Update Driver Location
```
POST /v1/drivers/:id/location
```

**Request:**
```json
{
  "latitude": 12.9716,
  "longitude": 77.5946,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Logic:**
1. Verify driver exists
2. If RabbitMQ available:
   - Publish `DriverLocationUpdatedEvent` to `drivers` exchange
   - Routing key: `driver.location.updated`
3. If RabbitMQ unavailable (fallback):
   - Update driver location directly in database
4. Return 204 No Content

**Async Processing (Location Consumer):**
```
RabbitMQ → location.processing queue → LocationConsumer
                                              ↓
                                   driverRepo.updateLocation()
```

**cURL:**
```bash
curl -X POST http://localhost:8080/v1/drivers/<DRIVER_ID>/location \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"latitude":12.9716,"longitude":77.5946}'
```

---

### 4.4 Update Driver Status
```
POST /v1/drivers/:id/status
```

**Request:**
```json
{
  "status": "available"
}
```

**Logic:**
1. Verify driver exists
2. Validate state transition:
   - If current status is ON_TRIP, can only transition to AVAILABLE
3. Update status in database
4. Return success response

**cURL:**
```bash
curl -X POST http://localhost:8080/v1/drivers/<DRIVER_ID>/status \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"status":"available"}'
```

---

### 4.5 Create Ride (Request Ride)
```
POST /v1/rides
```

**Request:**
```json
{
  "rider_id": "uuid",
  "pickup_location": {
    "latitude": 12.9716,
    "longitude": 77.5946,
    "address": "MG Road, Bangalore"
  },
  "dropoff_location": {
    "latitude": 12.9352,
    "longitude": 77.6245,
    "address": "Koramangala, Bangalore"
  },
  "vehicle_type": "economy",
  "payment_method": "cash"
}
```

**Logic:**
```
1. Check idempotency key
   └─> If exists, return existing ride

2. Calculate estimated fare:
   a. Calculate distance using Haversine formula
   b. Apply road factor (×1.3)
   c. Get fare strategy for vehicle_type
   d. Estimate: (baseFare + distance×perKm + estimatedTime×perMin) × 1.18 (GST)

3. Create Ride object:
   - status = REQUESTED
   - Generate UUID
   - Set tenant_id, rider_id, locations, fare

4. Insert into database

5. If RabbitMQ available:
   a. Create RideRequestedEvent
   b. Publish to 'rides' exchange with key 'ride.requested'
   c. Update status to SEARCHING_DRIVER

6. Return ride response with estimated_fare
```

**Async Flow Triggered:**
```
API → RabbitMQ(rides) → driver.matching queue → DriverMatchingConsumer
                                                        ↓
                                               Start Temporal Workflow
```

**cURL:**
```bash
curl -X POST http://localhost:8080/v1/rides \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -H "Idempotency-Key: ride-$(date +%s)" \
  -d '{
    "rider_id": "<RIDER_ID>",
    "pickup_location": {"latitude":12.9716,"longitude":77.5946,"address":"MG Road"},
    "dropoff_location": {"latitude":12.9352,"longitude":77.6245,"address":"Koramangala"},
    "vehicle_type": "economy",
    "payment_method": "cash"
  }'
```

---

### 4.6 Driver Accept Ride
```
POST /v1/drivers/:id/accept
```

**Request:**
```json
{
  "ride_id": "uuid",
  "estimated_arrival_minutes": 5
}
```

**Logic:**
```
1. Verify driver exists and status = AVAILABLE
   └─> Error if not available

2. Verify ride exists and status = SEARCHING_DRIVER or REQUESTED
   └─> Error if ride not available

3. Signal Temporal Workflow:
   a. Get workflow handle: ride-matching-{ride_id}
   b. Send signal: driverResponse { driverId, accepted: true }

4. If signal fails (workflow completed/not found):
   a. Fallback: Direct assignment
   b. Update ride.driver_id = driver_id
   c. Update driver.status = BUSY

5. Return success response
```

**cURL:**
```bash
curl -X POST http://localhost:8080/v1/drivers/<DRIVER_ID>/accept \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"ride_id":"<RIDE_ID>","estimated_arrival_minutes":5}'
```

---

### 4.7 Driver Decline Ride
```
POST /v1/drivers/:id/decline
```

**Request:**
```json
{
  "ride_id": "uuid"
}
```

**Logic:**
1. Verify driver exists
2. Verify ride exists
3. Signal Temporal Workflow with `accepted: false`
4. Driver added to declined set in workflow

**cURL:**
```bash
curl -X POST http://localhost:8080/v1/drivers/<DRIVER_ID>/decline \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"ride_id":"<RIDE_ID>"}'
```

---

### 4.8 Start Trip
```
POST /v1/trips
```

**Request:**
```json
{
  "ride_id": "uuid",
  "driver_id": "uuid"
}
```

**Logic:**
```
1. Verify ride exists
2. Verify ride has assigned driver
   └─> Error if no driver assigned

3. Create Trip object:
   - status = STARTED
   - start_location = ride.pickup_location (or provided)
   - start_time = now
   - surge_multiplier = 1.0
   - currency = INR

4. Insert trip into database

5. Update ride.status = TRIP_STARTED

6. Update driver.status = ON_TRIP

7. Send WebSocket notification to rider:
   - type: ride_status_update
   - payload: { ride_id, status: trip_started, trip_id }

8. Return trip response
```

**cURL:**
```bash
curl -X POST http://localhost:8080/v1/trips \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"ride_id":"<RIDE_ID>","driver_id":"<DRIVER_ID>"}'
```

---

### 4.9 End Trip
```
POST /v1/trips/:id/end
```

**Request:**
```json
{
  "end_location": {
    "latitude": 12.9352,
    "longitude": 77.6245
  }
}
```

**Logic:**
```
1. Verify trip exists
2. Verify trip status != ENDED or COMPLETED
   └─> Error if already ended

3. Calculate duration:
   duration_minutes = (now - start_time) / 60000

4. Calculate distance:
   a. Use Haversine formula between start_location and end_location
   b. Apply road factor (×1.3)

5. Calculate fare using FareCalculator:
   a. Get strategy for vehicle_type
   b. Apply formula:
      distanceFare = distance_km × perKmRate
      timeFare = duration_minutes × perMinuteRate
      subtotal = (baseFare + distanceFare + timeFare) × surgeMultiplier
      taxes = subtotal × 0.18 (18% GST)
      totalFare = subtotal + taxes

6. Update trip:
   - status = ENDED
   - end_location, end_time
   - distance_km, duration_minutes
   - baseFare, distanceFare, timeFare, totalFare

7. Update ride.status = COMPLETED

8. Update driver.status = AVAILABLE

9. Increment driver.total_trips

10. Send WebSocket notification to rider:
    - type: ride_status_update
    - payload: { ride_id, status: completed, final_fare, distance_km, duration_minutes }

11. Return fare breakdown
```

**Response:**
```json
{
  "tripId": "uuid",
  "distanceKm": 5.2,
  "durationMinutes": 18,
  "baseFare": 50,
  "distanceFare": 62.4,
  "timeFare": 27,
  "surgeMultiplier": 1.0,
  "subtotal": 139.4,
  "taxes": 25.09,
  "totalFare": 164.49,
  "currency": "INR"
}
```

**cURL:**
```bash
curl -X POST http://localhost:8080/v1/trips/<TRIP_ID>/end \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"end_location":{"latitude":12.9352,"longitude":77.6245}}'
```

---

### 4.10 Cancel Ride
```
POST /v1/rides/:id/cancel
```

**Request:**
```json
{
  "reason": "Changed my mind"
}
```

**Logic:**
1. Verify ride exists
2. Verify ride status != COMPLETED or CANCELLED
3. Update ride: status = CANCELLED, cancelled_at = now, cancellation_reason
4. If driver was assigned: Update driver.status = AVAILABLE
5. Return success response

**cURL:**
```bash
curl -X POST http://localhost:8080/v1/rides/<RIDE_ID>/cancel \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"reason":"Changed my mind"}'
```

---

## 5. Service Layer Logic

### 5.1 RideService

```javascript
class RideService {
  constructor(rideRepo, driverRepo, fareCalculator, rabbitMQ)

  // Main methods:
  async createRide(tenantId, data, idempotencyKey)
    → Check idempotency
    → Estimate fare
    → Create & save ride
    → Publish RideRequestedEvent

  async getRide(id, tenantId)
    → Fetch ride + driver details

  async cancelRide(id, tenantId, reason)
    → Validate state
    → Update ride status
    → Free driver if assigned
}
```

### 5.2 DriverService

```javascript
class DriverService {
  constructor(driverRepo, rideRepo, rabbitMQ, temporalClient)

  async createDriver(tenantId, data)
    → Validate vehicle_type
    → Create driver with OFFLINE status

  async updateLocation(id, tenantId, data)
    → Publish to RabbitMQ (async) OR update directly (sync)

  async updateStatus(id, tenantId, status)
    → Validate state transition
    → Update status

  async acceptRide(id, tenantId, data)
    → Validate driver available
    → Validate ride available
    → Signal Temporal workflow OR direct assign

  async declineRide(id, tenantId, data)
    → Signal Temporal workflow (driver declined)

  async signalDriverResponse(rideId, driverId, accepted)
    → Get workflow handle
    → Send driverResponse signal
}
```

### 5.3 TripService

```javascript
class TripService {
  constructor(tripRepo, rideRepo, driverRepo, fareCalculator)

  async startTrip(tenantId, data)
    → Verify ride has driver
    → Create trip (status=STARTED)
    → Update ride status = TRIP_STARTED
    → Update driver status = ON_TRIP

  async endTrip(tripId, tenantId, data)
    → Calculate duration
    → Calculate distance (Haversine + road factor)
    → Calculate fare (strategy pattern)
    → Update trip with all fare details
    → Update ride status = COMPLETED
    → Update driver status = AVAILABLE
    → Increment driver trip count

  calculateDistance(from, to)
    → Haversine formula
    → Apply 1.3x road factor
}
```

---

## 6. Temporal Workflow - Driver Matching

### Workflow: `rideMatchingWorkflow`

**Input:**
```javascript
{
  rideId, tenantId, riderId, vehicleType,
  pickupLatitude, pickupLongitude, estimatedFare,
  pickupLocation, dropoffLocation
}
```

**Configuration:**
```javascript
DEFAULT_INITIAL_RADIUS_KM = 1.0
MAX_MATCHING_ATTEMPTS = 3
WAIT_TIME_PER_RADIUS_MS = 60000  // 60 seconds
```

**Signals:**
- `driverResponse` - Driver accepts/declines
- `cancelMatching` - Ride cancelled

**State:**
```javascript
{
  cancelled: boolean,
  driverResponses: Map<driverId, {accepted, timestamp}>,
  declinedDrivers: Set<driverId>,
  pendingDrivers: Set<driverId>,
  acceptedDriverId: string | null
}
```

**Algorithm:**
```
FOR attempt = 1 TO 3:
    
    1. Check if cancelled → return { success: false, reason: 'cancelled' }
    
    2. Find nearby drivers:
       - Query: status=AVAILABLE, vehicle_type match
       - Radius: 1km → 2km → 4km (doubles each attempt)
       - Exclude: drivers who already declined
       
    3. For each eligible driver:
       - Add to pendingDrivers set
       - Send ride offer via WebSocket:
         → Activity: sendRideOfferToDriver
         → RabbitMQ → websocket.notifications → WebSocket Hub → Driver browser
       
    4. Wait for response (60 seconds):
       - condition() waits for acceptedDriverId OR cancelled
       
    5. If driver accepted:
       a. Verify driver still available
       b. Assign ride (optimistic locking)
       c. Update driver status = BUSY
       d. Notify rider: driver_assigned
       e. Notify other pending drivers: assigned_to_other
       f. Return { success: true, rideId, driverId }
       
    6. If no acceptance:
       - Clear pendingDrivers
       - Double radius for next attempt
       
END FOR

// After 3 attempts
7. Notify rider: no_driver_found
8. Return { success: false, reason: 'no_drivers_available' }
```

**Flow Diagram:**
```
                    ┌─────────────────────┐
                    │   Ride Requested    │
                    └──────────┬──────────┘
                               │
                               v
                    ┌─────────────────────┐
                    │ Start Workflow      │
                    │ (radius = 1km)      │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              v                                 v
    ┌─────────────────┐              ┌─────────────────┐
    │ Find Drivers    │              │   Cancelled?    │──Yes──> Exit
    │ in Radius       │              │                 │
    └────────┬────────┘              └─────────────────┘
             │
             v
    ┌─────────────────┐
    │ Send Offers     │
    │ (WebSocket)     │
    └────────┬────────┘
             │
             v
    ┌─────────────────┐        Signal
    │ Wait 60 sec     │<─────────────── Driver Accept/Decline
    │ for response    │
    └────────┬────────┘
             │
      ┌──────┴──────┐
      │             │
   Accepted      Timeout
      │             │
      v             v
┌───────────┐  ┌───────────┐
│ Assign    │  │ Expand    │
│ Driver    │  │ Radius ×2 │
└───────────┘  └─────┬─────┘
                     │
                  attempt < 3?
                     │
              ┌──────┴──────┐
              │             │
             Yes            No
              │             │
              v             v
        [Retry Loop]  ┌───────────┐
                      │ No Driver │
                      │ Found     │
                      └───────────┘
```

### Activities

| Activity | Purpose |
|----------|---------|
| `findNearbyDrivers` | Query available drivers within radius |
| `sendRideOfferToDriver` | Push offer via WebSocket |
| `assignRideToDriver` | Assign with optimistic locking |
| `notifyRideCancelled` | Notify pending drivers of cancellation |
| `notifyRideAssigned` | Notify other drivers ride is taken |
| `notifyNoDriverFound` | Notify rider no driver available |
| `expandSearchRadius` | Double search radius |

---

## 7. Message Queue Consumers

### 7.1 DriverMatchingConsumer

**Queue:** `driver.matching`
**Exchange:** `rides`
**Routing Key:** `ride.requested`

```javascript
processMessage(message):
  1. Parse RideRequestedEvent from message
  2. Create Temporal workflow ID: ride-matching-{rideId}
  3. Start workflow: rideMatchingWorkflow
  4. On success: ack message
  5. On "already started": ack (idempotent)
  6. On error: nack with requeue
```

### 7.2 LocationConsumer

**Queue:** `location.processing`
**Exchange:** `drivers`
**Routing Key:** `driver.location.*`

```javascript
processMessage(message):
  1. Parse DriverLocationUpdatedEvent
  2. Update driver location in database
  3. Update driver status if provided
  4. ack message
```

### 7.3 WebSocketNotificationConsumer

**Queue:** `websocket.notifications`
**Exchange:** `websocket`
**Routing Key:** `ws.*`

**Runs on:** API Server (not Worker)

```javascript
processMessage(message):
  1. Parse: { type, targetUserId, targetUserIds, payload }
  2. If targetUserId: wsHub.broadcastToUser(targetUserId, type, payload)
  3. If targetUserIds: loop and broadcast to each
  4. ack message
```

### 7.4 PaymentConsumer

**Queue:** `payment.processing`
**Exchange:** `payments`
**Routing Key:** `payment.*`

```javascript
processMessage(message):
  1. Parse PaymentInitiatedEvent
  2. Process payment with PSP (mock)
  3. Update payment status
  4. ack message
```

---

## 8. Fare Calculation (Strategy Pattern)

### Design Pattern
```
┌─────────────────────┐
│   FareCalculator    │
│  ─────────────────  │
│  strategies: Map    │
│  ─────────────────  │
│  calculateFare()    │
│  estimateFare()     │
└──────────┬──────────┘
           │ uses
           v
┌─────────────────────┐
│  BaseFareStrategy   │
│  ─────────────────  │
│  baseFare           │
│  perKmRate          │
│  perMinuteRate      │
│  ─────────────────  │
│  calculate()        │
│  estimate()         │
└──────────┬──────────┘
           │
     ┌─────┼─────┐
     │     │     │
     v     v     v
┌───────┐┌───────┐┌───────┐
│Economy││Premium││Luxury │
│$50/10 ││$80/18 ││$150/25│
│/1.5   ││/2.0   ││/3.0   │
└───────┘└───────┘└───────┘
```

### Fare Rates

| Type    | Base Fare (₹) | Per KM (₹) | Per Min (₹) |
|---------|---------------|------------|-------------|
| Economy | 50            | 12         | 1.5         |
| Premium | 80            | 18         | 2.0         |
| Luxury  | 150           | 25         | 3.0         |

### Calculation Formula

```javascript
calculate(distanceKm, durationMinutes, surgeMultiplier = 1.0):
  
  distanceFare = distanceKm × perKmRate
  timeFare = durationMinutes × perMinuteRate
  subtotal = (baseFare + distanceFare + timeFare) × surgeMultiplier
  taxes = subtotal × 0.18  // 18% GST
  totalFare = round(subtotal + taxes, 2)
  
  return {
    baseFare, distanceFare, timeFare,
    surgeMultiplier, subtotal, taxes,
    totalFare, currency: 'INR'
  }
```

### Distance Calculation (Haversine)

```javascript
calculateDistance(from, to):
  R = 6371  // Earth radius in km
  
  dLat = (to.latitude - from.latitude) × π / 180
  dLon = (to.longitude - from.longitude) × π / 180
  
  a = sin(dLat/2)² + cos(from.lat) × cos(to.lat) × sin(dLon/2)²
  c = 2 × atan2(√a, √(1-a))
  
  straightLineDistance = R × c
  roadDistance = straightLineDistance × 1.3  // Road factor
  
  return roadDistance
```

---

## 9. WebSocket Real-time Communication

### Connection
```
Client → ws://localhost:8080/ws?user_id={userId}
```

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `new_ride_offer` | Server→Driver | New ride available |
| `ride_status_update` | Server→Both | Status changed |
| `driver_location` | Server→Rider | Driver moved |

### WebSocket Hub Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        WebSocket Hub                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  clients: Map<userId, Set<WebSocket>>                           │
│                                                                  │
│  Methods:                                                        │
│  ─────────────────────────────────────────────────────────────  │
│  addClient(userId, ws)                                          │
│  removeClient(userId, ws)                                        │
│  broadcastToUser(userId, type, payload) → delivers to all ws    │
│  isUserConnected(userId) → boolean                              │
│  closeAll()                                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Message Flow

```
Temporal Activity
       │
       │ publishWebSocketNotification()
       │
       v
┌──────────────┐     ┌─────────────────────┐     ┌────────────────┐
│   RabbitMQ   │────>│ WS Notification     │────>│  WebSocket Hub │
│  (websocket  │     │ Consumer (API)      │     │                │
│   exchange)  │     └─────────────────────┘     └───────┬────────┘
└──────────────┘                                         │
                                                         │ broadcastToUser
                                                         v
                                                ┌────────────────┐
                                                │ Driver/Rider   │
                                                │ Browser        │
                                                └────────────────┘
```

---

## 10. Error Handling

### Error Types

```javascript
AppError {
  message: string
  code: string
  httpStatus: number
  details: any
}

DomainErrors = {
  NOT_FOUND(resource)              → 404
  VALIDATION_ERROR(details)        → 400
  UNAUTHORIZED(details)            → 401
  FORBIDDEN(details)               → 403
  INVALID_STATE_TRANSITION(from,to)→ 409
  IDEMPOTENCY_CONFLICT(key)        → 409
  DRIVER_UNAVAILABLE(id)           → 409
  INTERNAL_ERROR(err)              → 500
}
```

### Error Response Format

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "ride not found",
    "details": null
  }
}
```

---

## 11. Complete Flow Diagrams

### Complete Ride Flow

```
RIDER                  API                   WORKER               DRIVER
  │                     │                      │                    │
  │ POST /rides         │                      │                    │
  │────────────────────>│                      │                    │
  │                     │                      │                    │
  │                     │ Publish ride.requested                    │
  │                     │─────────────────────>│                    │
  │                     │                      │                    │
  │ { ride_id, status } │                      │ Start Temporal     │
  │<────────────────────│                      │ Workflow           │
  │                     │                      │                    │
  │                     │                      │ findNearbyDrivers  │
  │                     │                      │─ ─ ─ ─ ─ ─ ─ ─ ─ ─>│
  │                     │                      │                    │
  │                     │         WebSocket: new_ride_offer         │
  │                     │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
  │                     │                      │                    │
  │                     │                      │   POST /accept     │
  │                     │<─────────────────────┼────────────────────│
  │                     │                      │                    │
  │                     │ Signal workflow      │                    │
  │                     │─────────────────────>│                    │
  │                     │                      │                    │
  │                     │                      │ assignRideToDriver │
  │                     │                      │                    │
  │    WebSocket: ride_status_update (driver_assigned)             │
  │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
  │                     │                      │                    │
  │                     │                      │    POST /trips     │
  │                     │<─────────────────────┼────────────────────│
  │                     │                      │                    │
  │    WebSocket: ride_status_update (trip_started)                │
  │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
  │                     │                      │                    │
  │                     │               POST /trips/:id/end         │
  │                     │<─────────────────────┼────────────────────│
  │                     │                      │                    │
  │    WebSocket: ride_status_update (completed, fare)             │
  │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
  │                     │                      │                    │
```

### Driver Matching Sequence

```
┌────────────────────────────────────────────────────────────────────────┐
│                    DRIVER MATCHING SEQUENCE                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  t=0s   Ride Created                                                    │
│         └─> Publish to RabbitMQ                                         │
│         └─> Status: SEARCHING_DRIVER                                    │
│                                                                         │
│  t=1s   Worker receives message                                         │
│         └─> Start Temporal Workflow (ride-matching-{rideId})            │
│                                                                         │
│  t=2s   Workflow: Find drivers (1km radius)                            │
│         └─> Found: [Driver A, Driver B]                                 │
│                                                                         │
│  t=3s   Send ride offer to Driver A via WebSocket                      │
│  t=3s   Send ride offer to Driver B via WebSocket                      │
│                                                                         │
│  t=4s   Start 60s timer                                                 │
│         └─> condition() waiting for signal                              │
│                                                                         │
│  t=15s  Driver A declines                                               │
│         └─> Signal received: { driverId: A, accepted: false }           │
│         └─> A added to declinedDrivers                                  │
│                                                                         │
│  t=30s  Driver B accepts                                                │
│         └─> Signal received: { driverId: B, accepted: true }            │
│         └─> acceptedDriverId = B                                        │
│         └─> condition() exits early                                     │
│                                                                         │
│  t=31s  Assign driver B to ride                                         │
│         └─> ride.driver_id = B                                          │
│         └─> driver B status = BUSY                                      │
│         └─> Notify rider: driver_assigned                               │
│                                                                         │
│  t=32s  Workflow completes: { success: true, driverId: B }              │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Testing the Complete Flow

### Step-by-Step cURL Commands

```bash
# 1. Create Rider
RIDER_RESPONSE=$(curl -s -X POST http://localhost:8080/v1/users \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"name":"Test Rider","email":"rider@test.com","phone":"+919876543210","role":"rider"}')
RIDER_ID=$(echo $RIDER_RESPONSE | jq -r '.id')
echo "Rider ID: $RIDER_ID"

# 2. Create Driver User
DRIVER_USER_RESPONSE=$(curl -s -X POST http://localhost:8080/v1/users \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"name":"Test Driver","email":"driver@test.com","phone":"+919876543211","role":"driver"}')
DRIVER_USER_ID=$(echo $DRIVER_USER_RESPONSE | jq -r '.id')
echo "Driver User ID: $DRIVER_USER_ID"

# 3. Register Driver
DRIVER_RESPONSE=$(curl -s -X POST http://localhost:8080/v1/drivers \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d "{\"user_id\":\"$DRIVER_USER_ID\",\"vehicle_type\":\"economy\",\"vehicle_number\":\"KA01AB1234\",\"license_number\":\"DL123456789\"}")
DRIVER_ID=$(echo $DRIVER_RESPONSE | jq -r '.id')
echo "Driver ID: $DRIVER_ID"

# 4. Set Driver Online
curl -X POST "http://localhost:8080/v1/drivers/$DRIVER_ID/status" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"status":"available"}'

# 5. Update Driver Location (near pickup)
curl -X POST "http://localhost:8080/v1/drivers/$DRIVER_ID/location" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"latitude":12.9716,"longitude":77.5946}'

# 6. Create Ride
RIDE_RESPONSE=$(curl -s -X POST http://localhost:8080/v1/rides \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -H "Idempotency-Key: test-ride-$(date +%s)" \
  -d "{\"rider_id\":\"$RIDER_ID\",\"pickup_location\":{\"latitude\":12.9716,\"longitude\":77.5946,\"address\":\"MG Road\"},\"dropoff_location\":{\"latitude\":12.9352,\"longitude\":77.6245,\"address\":\"Koramangala\"},\"vehicle_type\":\"economy\",\"payment_method\":\"cash\"}")
RIDE_ID=$(echo $RIDE_RESPONSE | jq -r '.id')
echo "Ride ID: $RIDE_ID"

# 7. Check Ride Status
curl -s "http://localhost:8080/v1/rides/$RIDE_ID" \
  -H "X-Tenant-ID: default" | jq

# 8. Driver Accepts Ride
curl -X POST "http://localhost:8080/v1/drivers/$DRIVER_ID/accept" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d "{\"ride_id\":\"$RIDE_ID\",\"estimated_arrival_minutes\":5}"

# 9. Start Trip
TRIP_RESPONSE=$(curl -s -X POST http://localhost:8080/v1/trips \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d "{\"ride_id\":\"$RIDE_ID\",\"driver_id\":\"$DRIVER_ID\"}")
TRIP_ID=$(echo $TRIP_RESPONSE | jq -r '.tripId')
echo "Trip ID: $TRIP_ID"

# 10. End Trip
curl -s -X POST "http://localhost:8080/v1/trips/$TRIP_ID/end" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"end_location":{"latitude":12.9352,"longitude":77.6245}}' | jq
```

---

## 13. Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | localhost | MySQL host |
| `DB_PORT` | 3306 | MySQL port |
| `DB_USER` | ridehail | MySQL user |
| `DB_PASSWORD` | ridehail123 | MySQL password |
| `DB_NAME` | ridehail | Database name |
| `REDIS_HOST` | localhost | Redis host |
| `REDIS_PORT` | 6379 | Redis port |
| `RABBITMQ_URL` | amqp://admin:admin@localhost:5672 | RabbitMQ URL |
| `TEMPORAL_ADDRESS` | localhost:7233 | Temporal server |
| `NODE_ENV` | development | Environment |

---

*End of LLD Document*

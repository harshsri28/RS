# Ride-Hailing Platform - Setup Guide

## Prerequisites

Before setting up the project, ensure you have the following installed:

| Software       | Version  | Required | Purpose                    |
|----------------|----------|----------|----------------------------|
| Docker         | 20+      | Yes      | Container runtime          |
| Docker Compose | 2.0+     | Yes      | Multi-container orchestration |
| Node.js        | 18+      | Optional | Local development          |
| npm            | 9+       | Optional | Package management         |

---

## Quick Start (Docker - Recommended)

### 1. Clone the Repository
```bash
cd /path/to/your/projects
git clone <repository-url>
cd ride-hailing-platform
```

### 2. Create Environment File
```bash
cp .env.example .env
```

### 3. Start All Services
```bash
# Start all containers (MySQL, Redis, RabbitMQ, Temporal, API, Worker)
docker-compose up -d
```

### 4. Wait for Services to be Healthy
```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f api
```

### 5. Verify Setup
```bash
# Health check
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": "connected",
  "redis": "connected",
  "rabbitmq": "connected"
}
```

---

## Service URLs

| Service         | URL                           | Credentials          |
|-----------------|-------------------------------|----------------------|
| API Server      | http://localhost:8080         | -                    |
| WebSocket       | ws://localhost:8080/ws        | -                    |
| Frontend        | http://localhost:5173         | -                    |
| RabbitMQ UI     | http://localhost:15672        | admin / admin        |
| Temporal UI     | http://localhost:8088         | -                    |
| Prometheus Metrics | http://localhost:8080/metrics | -                 |

---

## Local Development Setup

If you prefer running services locally (for development):

### 1. Start Infrastructure Only
```bash
# Start only MySQL, Redis, RabbitMQ, Temporal
docker-compose up -d mysql redis rabbitmq temporal temporal-ui
```

### 2. Wait for Infrastructure
```bash
# MySQL takes ~30s to initialize, Temporal takes ~90s
docker-compose logs -f temporal
# Wait until you see "Server started"
```

### 3. Install Node.js Dependencies
```bash
# Backend dependencies
npm install

# Frontend dependencies
cd frontend && npm install && cd ..
```

### 4. Configure Environment
```bash
# Create .env file for local development
cat > .env << 'EOF'
DB_HOST=localhost
DB_PORT=3306
DB_USER=ridehail
DB_PASSWORD=ridehail123
DB_NAME=ridehail
REDIS_HOST=localhost
REDIS_PORT=6379
RABBITMQ_URL=amqp://admin:admin@localhost:5672
TEMPORAL_ADDRESS=localhost:7233
NODE_ENV=development
EOF
```

### 5. Run Backend Services
```bash
# Terminal 1: Start API server
npm run dev

# Terminal 2: Start worker
npm run worker:dev
```

### 6. Run Frontend
```bash
# Terminal 3: Start frontend dev server
npm run frontend
# Or: cd frontend && npm run dev
```

---

## Setting Up Test Data

### 1. Run Setup Script
```bash
# Create test users and drivers
bash setup_test_data.sh
```

### 2. Manual Test Data (cURL)

**Create a Rider:**
```bash
curl -X POST http://localhost:8080/v1/users \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{
    "name": "Test Rider",
    "email": "rider@test.com",
    "phone": "+919876543210",
    "user_type": "rider"
  }'
```

**Create a Driver User:**
```bash
curl -X POST http://localhost:8080/v1/users \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{
    "name": "Test Driver",
    "email": "driver@test.com",
    "phone": "+919876543211",
    "user_type": "driver"
  }'
```

**Register Driver (use user_id from above):**
```bash
curl -X POST http://localhost:8080/v1/drivers \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{
    "user_id": "<USER_ID_FROM_ABOVE>",
    "vehicle_type": "economy",
    "vehicle_number": "KA01AB1234",
    "license_number": "DL123456789"
  }'
```

**Set Driver Online:**
```bash
curl -X POST http://localhost:8080/v1/drivers/<DRIVER_ID>/status \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{"status": "available"}'
```

**Update Driver Location:**
```bash
curl -X POST http://localhost:8080/v1/drivers/<DRIVER_ID>/location \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{
    "latitude": 12.9716,
    "longitude": 77.5946,
    "timestamp": "2024-01-01T00:00:00Z"
  }'
```

---

## Testing the Complete Flow

### 1. Create a Ride Request
```bash
curl -X POST http://localhost:8080/v1/rides \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -H "Idempotency-Key: test-ride-001" \
  -d '{
    "rider_id": "<RIDER_USER_ID>",
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
  }'
```

### 2. Check Ride Status
```bash
curl http://localhost:8080/v1/rides/<RIDE_ID> \
  -H "X-Tenant-ID: default"
```

### 3. Driver Accepts Ride
```bash
curl -X POST http://localhost:8080/v1/drivers/<DRIVER_ID>/accept \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{
    "ride_id": "<RIDE_ID>",
    "estimated_arrival_minutes": 5
  }'
```

### 4. Start Trip
```bash
curl -X POST http://localhost:8080/v1/trips \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{
    "ride_id": "<RIDE_ID>",
    "driver_id": "<DRIVER_ID>"
  }'
```

### 5. End Trip
```bash
curl -X POST http://localhost:8080/v1/trips/<TRIP_ID>/end \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default" \
  -d '{
    "end_location": {
      "latitude": 12.9352,
      "longitude": 77.6245
    }
  }'
```

---

## Running Tests

### Unit/Integration Tests
```bash
npm test
```

### End-to-End Test
```bash
npm run test:e2e
# Or: bash test/e2e/ride_flow_test.sh
```

### Load Tests
```bash
# Install locust first
pip install locust

# Run load tests
locust -f test/load/locustfile.py --host=http://localhost:8080
# Open http://localhost:8089 for Locust UI
```

---

## Troubleshooting

### Container Startup Issues

**MySQL not starting:**
```bash
# Check logs
docker-compose logs mysql

# Reset MySQL data
docker-compose down -v
docker-compose up -d
```

**Temporal taking too long:**
```bash
# Temporal needs MySQL to be fully ready first
# Wait 2-3 minutes after MySQL starts
docker-compose logs -f temporal
```

### Connection Refused

**API can't connect to MySQL:**
```bash
# Ensure MySQL is healthy
docker-compose ps
# Should show "healthy" for mysql container

# If running locally, check .env has correct credentials
```

**WebSocket not connecting:**
```bash
# Check WebSocket is enabled
curl http://localhost:8080/ws/stats

# Check browser console for errors
```

### Port Conflicts

If ports are already in use:
```bash
# Check what's using ports
lsof -i :8080
lsof -i :3306
lsof -i :6379

# Modify docker-compose.yml to use different ports
```

---

## Stopping Services

### Stop All Containers
```bash
docker-compose down
```

### Stop and Remove Data
```bash
# WARNING: This deletes all data!
docker-compose down -v
```

### Stop Specific Service
```bash
docker-compose stop api
docker-compose stop worker
```

---

## Production Deployment

### Using Production Docker Compose
```bash
# Uses nginx for frontend and optimized settings
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables for Production
```bash
# Set secure passwords in .env
DB_ROOT_PASSWORD=<secure_password>
DB_PASSWORD=<secure_password>
REDIS_PASSWORD=<secure_password>
RABBITMQ_PASSWORD=<secure_password>
NODE_ENV=production
```

---

## Useful Commands

| Command                        | Description                          |
|--------------------------------|--------------------------------------|
| `docker-compose ps`            | List running containers              |
| `docker-compose logs -f api`   | Follow API logs                      |
| `docker-compose restart api`   | Restart API service                  |
| `docker-compose exec mysql mysql -u ridehail -p ridehail` | MySQL shell |
| `docker-compose exec redis redis-cli` | Redis CLI                       |
| `npm run dev`                  | Start API in dev mode (local)        |
| `npm run worker:dev`           | Start worker in dev mode (local)     |
| `npm run frontend`             | Start frontend dev server            |

---

## Architecture Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM COMPONENTS                         │
├──────────────────┬──────────────────────────────────────────┤
│ Frontend (5173)  │ React + Vite + TailwindCSS               │
│ API Server (8080)│ Express.js + WebSocket                   │
│ Worker           │ Temporal Worker + RabbitMQ Consumers     │
│ MySQL (3306)     │ Primary database                         │
│ Redis (6379)     │ Cache + Geo-spatial index                │
│ RabbitMQ (5672)  │ Message broker                           │
│ Temporal (7233)  │ Workflow orchestration                   │
└──────────────────┴──────────────────────────────────────────┘
```

---

## Support

- Check logs: `docker-compose logs <service>`
- Health endpoint: `GET /health`
- Metrics endpoint: `GET /metrics`
- WebSocket stats: `GET /ws/stats`

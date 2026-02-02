# Ride-Hailing Platform - Backend High-Level Design (HLD)

## 1. Overview

A multi-tenant ride-hailing platform backend built with Node.js (Express.js) featuring real-time driver matching, trip management, and payment processing.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENTS                                        │
│                    (Frontend / Mobile Apps / Third-Party)                        │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              NGINX (Load Balancer)                               │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │ API-1    │   │ API-2    │   │ API-N    │   ← Horizontal Scaling
              │ (8080)   │   │ (8080)   │   │ (8080)   │
              └────┬─────┘   └────┬─────┘   └────┬─────┘
                   │              │              │
                   └──────────────┼──────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MySQL 8.0     │    │   Redis 7       │    │   RabbitMQ      │
│   (Primary DB)  │    │   (Cache/Geo)   │    │   (Message Q)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                  │
                                  ▼
                       ┌─────────────────┐
                       │   Temporal      │   ← Workflow Orchestration
                       │   (Workflows)   │
                       └────────┬────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Worker        │   ← Background Jobs
                       │   (Consumers)   │
                       └─────────────────┘
```

---

## 3. Tech Stack

| Component        | Technology           | Purpose                              |
|------------------|----------------------|--------------------------------------|
| Runtime          | Node.js (ES Modules) | Server runtime                       |
| Framework        | Express.js           | HTTP API framework                   |
| Database         | MySQL 8.0            | Primary data storage                 |
| Cache            | Redis 7              | Caching + Geo-spatial queries        |
| Message Queue    | RabbitMQ 3.x         | Async event processing               |
| Workflow Engine  | Temporal             | Driver matching orchestration        |
| Real-time        | WebSocket (ws)       | Push notifications                   |
| Metrics          | Prometheus (prom-client) | Monitoring                       |
| Containerization | Docker + Docker Compose | Deployment                        |

---

## 4. Core Components

### 4.1 API Server (`src/cmd/api.js`)

Entry point for the HTTP API server with:
- Express router with versioned endpoints (`/v1/*`)
- WebSocket server on `/ws`
- Health check at `/health`
- Prometheus metrics at `/metrics`
- Graceful shutdown handling

### 4.2 Worker (`src/cmd/worker.js`)

Background worker processing:
- Temporal workflows for ride matching
- RabbitMQ consumers for async tasks
- Location updates, notifications, payments

---

## 5. API Endpoints

### Users
| Method | Endpoint         | Description          |
|--------|------------------|----------------------|
| POST   | `/v1/users`      | Create a new user    |
| GET    | `/v1/users/:id`  | Get user by ID       |

### Rides
| Method | Endpoint              | Description              |
|--------|-----------------------|--------------------------|
| POST   | `/v1/rides`           | Request a new ride       |
| GET    | `/v1/rides/:id`       | Get ride details         |
| POST   | `/v1/rides/:id/cancel`| Cancel a ride            |

### Drivers
| Method | Endpoint                  | Description              |
|--------|---------------------------|--------------------------|
| POST   | `/v1/drivers`             | Register a new driver    |
| GET    | `/v1/drivers/:id`         | Get driver details       |
| POST   | `/v1/drivers/:id/location`| Update driver location   |
| POST   | `/v1/drivers/:id/status`  | Update driver status     |
| POST   | `/v1/drivers/:id/accept`  | Accept a ride offer      |
| POST   | `/v1/drivers/:id/decline` | Decline a ride offer     |

### Trips
| Method | Endpoint              | Description          |
|--------|-----------------------|----------------------|
| POST   | `/v1/trips`           | Start a trip         |
| GET    | `/v1/trips/:id`       | Get trip details     |
| POST   | `/v1/trips/:id/end`   | End and finalize trip|

---

## 6. Data Models

### 6.1 Entity Relationship

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│  Users   │──────<│  Rides   │>──────│ Drivers  │
│          │       │          │       │          │
└──────────┘       └────┬─────┘       └──────────┘
                        │
                        │
                   ┌────▼─────┐
                   │  Trips   │
                   │          │
                   └────┬─────┘
                        │
                   ┌────▼─────┐
                   │ Payments │
                   └──────────┘
```

### 6.2 Key Tables

| Table     | Description                                    |
|-----------|------------------------------------------------|
| `users`   | Riders, drivers, admins (multi-tenant)         |
| `drivers` | Driver profiles, vehicle info, status, location|
| `rides`   | Ride requests with pickup/dropoff locations    |
| `trips`   | Active trips with fare calculation             |
| `payments`| Payment records with PSP integration           |

---

## 7. Driver Matching Workflow (Temporal)

```
┌─────────────────────────────────────────────────────────────────┐
│                    RIDE MATCHING WORKFLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Ride Requested → Publish to RabbitMQ                        │
│            ↓                                                     │
│  2. Worker starts Temporal workflow                              │
│            ↓                                                     │
│  3. Find nearby drivers (1km radius)                            │
│            ↓                                                     │
│  4. Send ride offer via WebSocket                                │
│            ↓                                                     │
│  5. Wait 60s for driver response (signal)                       │
│            ↓                                                     │
│  [If accepted] → Assign driver → Notify rider                   │
│  [If declined/timeout] → Expand radius (2km, 4km)               │
│            ↓                                                     │
│  6. After 3 attempts → Notify "No driver found"                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Message Queues (RabbitMQ)

| Queue                      | Purpose                              |
|----------------------------|--------------------------------------|
| `driver_matching`          | Trigger ride matching workflows      |
| `location_processing`      | Process driver location updates      |
| `notifications`            | General notification processing      |
| `payment_processing`       | Handle payment transactions          |
| `websocket_notifications`  | Push real-time updates via WebSocket |

---

## 9. Caching Strategy (Redis)

| Key Pattern                          | TTL      | Purpose                     |
|--------------------------------------|----------|-----------------------------|
| `driver:{id}`                        | 5 min    | Driver profile cache        |
| `ride:{id}`                          | 10 min   | Ride details cache          |
| `geo:drivers:{tenant_id}`            | Real-time| Geo-spatial driver index    |
| `idempotency:{key}`                  | 24 hrs   | Request deduplication       |

---

## 10. Middleware Pipeline

```
Request → CORS → JSON Parser → Logging → Auth → Idempotency → Handler → Recovery
```

| Middleware     | Purpose                                           |
|----------------|---------------------------------------------------|
| `cors`         | Cross-origin resource sharing                     |
| `logging`      | Request/response logging (Pino)                   |
| `auth`         | JWT token validation + tenant extraction          |
| `idempotency`  | Prevent duplicate requests (POST)                 |
| `recovery`     | Global error handling                             |

---

## 11. Fare Calculation

Strategy pattern supporting multiple vehicle types:

| Vehicle Type | Base Fare | Per KM  | Per Minute |
|--------------|-----------|---------|------------|
| Economy      | ₹30       | ₹10     | ₹1.5       |
| Premium      | ₹50       | ₹15     | ₹2.0       |
| Luxury       | ₹100      | ₹25     | ₹3.5       |

Formula: `Total = Base + (Distance × PerKM) + (Duration × PerMin) × SurgeMultiplier`

---

## 12. Multi-Tenancy

- All tables include `tenant_id` column
- `X-Tenant-ID` header required for all API requests
- Tenant-scoped queries for data isolation
- Separate Redis geo-index per tenant

---

## 13. Scalability Considerations

| Component     | Scaling Strategy                                  |
|---------------|---------------------------------------------------|
| API Servers   | Horizontal scaling behind NGINX                   |
| Workers       | Multiple worker instances with queue partitioning |
| MySQL         | Read replicas + connection pooling                |
| Redis         | Redis Cluster for high availability               |
| RabbitMQ      | Clustered mode with mirrored queues               |
| Temporal      | Multi-worker deployment                           |

---

## 14. Monitoring & Observability

| Metric Type        | Examples                                        |
|--------------------|-------------------------------------------------|
| HTTP Metrics       | Request count, latency, error rate              |
| DB Metrics         | Query time, connection pool utilization         |
| Cache Metrics      | Hit/miss ratio, latency                         |
| Business Metrics   | Rides created, trips completed, fare totals     |

---

## 15. Error Handling

Custom error types with structured responses:

```json
{
  "error": {
    "code": "RIDE_NOT_FOUND",
    "message": "Ride with ID xyz not found",
    "status": 404
  }
}
```

---

## 16. Security

- JWT-based authentication
- Tenant isolation at database level
- Input validation using Joi
- Rate limiting (recommended)
- HTTPS in production

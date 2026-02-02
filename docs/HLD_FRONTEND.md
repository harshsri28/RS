# Ride-Hailing Platform - Frontend High-Level Design (HLD)

## 1. Overview

A React-based single-page application (SPA) providing real-time dashboards for riders and drivers with map integration and WebSocket communication.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND APPLICATION                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          PRESENTATION LAYER                              │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │    │
│  │  │ LandingPage  │  │RiderDashboard│  │DriverDashboard│                  │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          SERVICE LAYER                                   │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │    │
│  │  │   API Client │  │  WebSocket   │  │  React Query │                   │    │
│  │  │   (Axios)    │  │  Service     │  │  (Caching)   │                   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          STATE MANAGEMENT                                │    │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │    │
│  │  │                     Zustand Store                                 │   │    │
│  │  │  (User State, Ride State, Driver State, WebSocket State)         │   │    │
│  │  └──────────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└───────────────────────────────────────┬─────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
           ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
           │  REST API    │    │  WebSocket   │    │  Map Tiles   │
           │  (Backend)   │    │  (Backend)   │    │ (OpenStreetMap)│
           └──────────────┘    └──────────────┘    └──────────────┘
```

---

## 3. Tech Stack

| Component        | Technology           | Purpose                              |
|------------------|----------------------|--------------------------------------|
| Framework        | React 18             | UI library                           |
| Build Tool       | Vite 5               | Fast bundler & dev server            |
| Language         | TypeScript           | Type safety                          |
| Routing          | React Router DOM 6   | Client-side routing                  |
| HTTP Client      | Axios                | REST API communication               |
| Data Fetching    | TanStack React Query | Server state management & caching    |
| State Management | Zustand              | Client state management              |
| Map              | Leaflet + React-Leaflet | Interactive maps                  |
| Styling          | TailwindCSS          | Utility-first CSS                    |
| Notifications    | React Hot Toast      | Toast notifications                  |
| Real-time        | Native WebSocket     | Live updates                         |

---

## 4. Component Structure

```
src/
├── components/
│   ├── RiderDashboard.tsx    # Rider view - book rides, track status
│   └── DriverDashboard.tsx   # Driver view - receive offers, manage trips
├── services/
│   ├── api.ts                # REST API client (Axios)
│   └── websocket.ts          # WebSocket service (singleton)
├── App.tsx                   # Main app with routing
├── main.tsx                  # Entry point
└── index.css                 # Global styles (Tailwind)
```

---

## 5. Page Routes

| Route      | Component          | Description                          |
|------------|--------------------|--------------------------------------|
| `/`        | LandingPage        | Role selection (Rider/Driver)        |
| `/rider`   | RiderDashboard     | Book rides, view status, track driver|
| `/driver`  | DriverDashboard    | Accept rides, manage trips           |
| `*`        | Redirect to `/`    | Catch-all redirect                   |

---

## 6. Rider Dashboard Features

```
┌─────────────────────────────────────────────────────────────────┐
│                      RIDER DASHBOARD                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    INTERACTIVE MAP                       │    │
│  │  • Current location marker                               │    │
│  │  • Pickup point selection                                │    │
│  │  • Dropoff point selection                               │    │
│  │  • Driver location tracking (when assigned)              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  BOOKING PANEL                           │    │
│  │  • Pickup location input                                 │    │
│  │  • Dropoff location input                                │    │
│  │  • Vehicle type selector (Economy/Premium/Luxury)        │    │
│  │  • Estimated fare display                                │    │
│  │  • "Request Ride" button                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  RIDE STATUS CARD                        │    │
│  │  • Current status (Searching/Assigned/OnTrip/Completed)  │    │
│  │  • Driver info (when assigned)                           │    │
│  │  • ETA display                                           │    │
│  │  • Cancel ride option                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Driver Dashboard Features

```
┌─────────────────────────────────────────────────────────────────┐
│                      DRIVER DASHBOARD                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   STATUS TOGGLE                          │    │
│  │  • Online / Offline switch                               │    │
│  │  • Current status indicator                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    INTERACTIVE MAP                       │    │
│  │  • Current location (auto-updated)                       │    │
│  │  • Pickup point (when ride assigned)                     │    │
│  │  • Dropoff point (when on trip)                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                RIDE OFFER CARD (Real-time)               │    │
│  │  • Pickup location                                       │    │
│  │  • Dropoff location                                      │    │
│  │  • Estimated fare                                        │    │
│  │  • Distance to pickup                                    │    │
│  │  • Accept / Decline buttons                              │    │
│  │  • Countdown timer (offer expiry)                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                ACTIVE TRIP PANEL                         │    │
│  │  • Trip status (Arriving/In Progress)                    │    │
│  │  • Rider info                                            │    │
│  │  • Navigation to pickup/dropoff                          │    │
│  │  • "Start Trip" / "End Trip" buttons                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. API Service (`api.ts`)

### Configuration
```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/v1';
```

### Request Interceptors
- Auto-attach Bearer token from `localStorage`
- Add `X-Tenant-ID` header
- Add `Idempotency-Key` for POST requests

### API Modules

| Module      | Methods                                          |
|-------------|--------------------------------------------------|
| `rideApi`   | `createRide`, `getRide`, `cancelRide`            |
| `driverApi` | `createDriver`, `getDriver`, `updateLocation`, `updateStatus`, `acceptRide`, `declineRide` |
| `tripApi`   | `startTrip`, `getTrip`, `endTrip`                |
| `userApi`   | `createUser`, `getUser`                          |
| `healthApi` | `check`                                          |

---

## 9. WebSocket Service (`websocket.ts`)

### Connection
```typescript
// URL: ws://localhost:8080/ws?user_id={userId}
wsService.connect(userId);
```

### Event Types

| Event                  | Payload                                    | Direction |
|------------------------|--------------------------------------------|-----------|
| `connected`            | `{ userId }`                               | Client    |
| `disconnected`         | `{ code, reason }`                         | Client    |
| `ride_offer`           | `{ rideId, pickup, dropoff, fare, expiry }`| Server→Driver |
| `ride_assigned`        | `{ rideId, driverId, driverInfo }`         | Server→Rider |
| `ride_cancelled`       | `{ rideId, reason }`                       | Server→Both |
| `driver_location`      | `{ driverId, latitude, longitude }`        | Server→Rider |
| `trip_started`         | `{ tripId, rideId }`                       | Server→Both |
| `trip_ended`           | `{ tripId, fare, duration, distance }`     | Server→Both |

### Features
- Automatic reconnection with exponential backoff
- Event listener subscription (`on`/`off`)
- Max 10 reconnect attempts
- 30s maximum backoff delay

---

## 10. State Management (Zustand)

### Store Structure (Conceptual)

```typescript
interface AppStore {
  // User state
  userId: string | null;
  userRole: 'rider' | 'driver' | null;
  
  // Rider state
  currentRide: Ride | null;
  pickupLocation: Location | null;
  dropoffLocation: Location | null;
  
  // Driver state
  driverStatus: 'offline' | 'available' | 'busy' | 'on_trip';
  pendingOffer: RideOffer | null;
  currentTrip: Trip | null;
  
  // WebSocket state
  isConnected: boolean;
}
```

---

## 11. Map Integration (Leaflet)

### Features
- OpenStreetMap tiles (free, no API key)
- Interactive markers for locations
- Click-to-select pickup/dropoff points
- Real-time driver location tracking
- Route visualization (optional)

### Map Configuration
```typescript
center: [12.9716, 77.5946]  // Default: Bangalore, India
zoom: 13
```

---

## 12. Data Flow Diagrams

### Ride Booking Flow
```
┌──────┐    ┌─────────┐    ┌──────────┐    ┌───────────────┐
│Rider │───>│ Select  │───>│POST /rides│───>│ Show Status   │
│      │    │Locations│    │          │    │ "Searching"   │
└──────┘    └─────────┘    └──────────┘    └───────────────┘
                                                   │
                                                   ▼
                                          ┌───────────────┐
                          WebSocket <─────│ ride_assigned │
                                          └───────────────┘
```

### Driver Accept Flow
```
┌──────┐    ┌──────────┐    ┌─────────────────┐    ┌─────────────┐
│Driver│<───│ride_offer│<───│ WebSocket Event │    │POST /accept │
│      │    │ Card     │    │                 │───>│             │
└──────┘    └──────────┘    └─────────────────┘    └─────────────┘
                                                          │
                                                          ▼
                                                  ┌─────────────┐
                                                  │Start Trip UI│
                                                  └─────────────┘
```

---

## 13. Responsive Design

| Breakpoint | Target Device       | Layout                     |
|------------|---------------------|----------------------------|
| `sm`       | Mobile (<640px)     | Single column, stacked     |
| `md`       | Tablet (640-1024px) | Two columns               |
| `lg`       | Desktop (>1024px)   | Full layout with sidebar   |

---

## 14. Error Handling

| Error Type        | Handling Strategy                              |
|-------------------|------------------------------------------------|
| API Errors        | Toast notifications + inline error display     |
| WebSocket Errors  | Auto-reconnect + connection status indicator   |
| Network Offline   | Offline banner + cached data display           |
| Validation Errors | Form field highlighting + error messages       |

---

## 15. Performance Optimizations

| Technique                | Implementation                              |
|--------------------------|---------------------------------------------|
| Code Splitting           | Route-based lazy loading                    |
| API Caching              | React Query with stale-while-revalidate    |
| WebSocket Efficiency     | Single connection, multiplexed events      |
| Map Tile Caching         | Browser cache for map tiles                |
| Debounced Location       | 5s interval for driver location updates    |

---

## 16. Environment Variables

| Variable          | Default                  | Description              |
|-------------------|--------------------------|--------------------------|
| `VITE_API_URL`    | `http://localhost:8080/v1` | Backend API URL        |
| `VITE_WS_URL`     | `localhost:8080`         | WebSocket server URL     |

---

## 17. Build & Deployment

### Development
```bash
npm run dev          # Start dev server (port 5173)
```

### Production Build
```bash
npm run build        # TypeScript compile + Vite build
npm run preview      # Preview production build
```

### Docker
```dockerfile
# Multi-stage build with nginx serving static files
# See frontend/Dockerfile
```

---

## 18. Browser Support

- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)

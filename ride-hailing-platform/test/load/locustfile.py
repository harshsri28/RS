# test/load/locustfile.py
# Load testing for Ride Hailing Platform - Phase 3
# Run with: locust -f test/load/locustfile.py --host=http://localhost:8080

from locust import HttpUser, task, between, events
import random
import uuid
import json
import time

# Test data pools
VEHICLE_TYPES = ["economy", "premium", "luxury", "suv"]
PAYMENT_METHODS = ["card", "cash", "wallet"]

# Real IDs from database - required due to foreign key constraints
RIDER_IDS = [
    "1c83939f-33a9-4e34-9f0f-484e1ebae3ae",
    "20cd38ab-b992-4291-8f95-54eba1e7c5b1",
    "233afc5a-3623-4c23-b9c5-34ac5b6410a2",
    "24b40b14-e0b0-4661-982f-47c481b0a245",
    "98e4bc06-3646-441e-b6fc-c33ea4f629d9",
    "9f5193c6-aeb5-41a3-af8c-e329537d4520",
    "a8278a1a-4639-45e5-8bcb-7789d2f21aed",
    "b49d182f-2286-4fc4-8dd0-ff050aa6b5a8",
    "cb042575-6029-43a2-a0c5-403f2a2fc208",
    "e3f192ac-b1e2-4ab9-a7ac-ffd627b91fda",
]

DRIVER_IDS = [
    "38529d70-5618-495c-af4b-8d01589f8e4e",
    "5250f02e-42aa-4564-a692-b9d735b78fc9",
    "7fc6606d-44da-45cf-b239-dfde733ca694",
    "a8f887bd-ca66-4b4e-9ce7-d6e0eeb2684c",
    "bddc364e-69c8-46bc-a1d2-2602fb1a5f1b",
    "a6486d41-f9ef-481d-99f9-9059e59fb96e",
]

# Bangalore coordinates for realistic testing
BASE_LAT = 12.9716
BASE_LNG = 77.5946
LOCATION_VARIANCE = 0.1


def random_location():
    """Generate random location around Bangalore"""
    return {
        "latitude": BASE_LAT + random.uniform(-LOCATION_VARIANCE, LOCATION_VARIANCE),
        "longitude": BASE_LNG + random.uniform(-LOCATION_VARIANCE, LOCATION_VARIANCE),
        "address": f"Test Location {random.randint(1, 1000)}"
    }


class RideHailingUser(HttpUser):
    """Simulates a rider requesting and tracking rides"""
    
    wait_time = between(1, 3)
    
    def on_start(self):
        """Setup - runs once per user"""
        self.rider_id = random.choice(RIDER_IDS)
        self.tenant_id = "tenant_1"
        self.headers = {
            "Content-Type": "application/json",
            "X-Tenant-ID": self.tenant_id
        }
        self.created_rides = []
    
    @task(3)
    def create_ride(self):
        """Test ride creation endpoint"""
        idempotency_key = str(uuid.uuid4())
        
        payload = {
            "rider_id": self.rider_id,
            "pickup_location": random_location(),
            "dropoff_location": random_location(),
            "vehicle_type": random.choice(VEHICLE_TYPES),
            "payment_method": random.choice(PAYMENT_METHODS)
        }
        
        headers = {
            **self.headers,
            "Idempotency-Key": idempotency_key
        }
        
        with self.client.post("/v1/rides", 
                              json=payload, 
                              headers=headers, 
                              catch_response=True) as response:
            if response.status_code == 201:
                try:
                    data = response.json()
                    if data.get("id"):
                        self.created_rides.append(data["id"])
                    response.success()
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            else:
                response.failure(f"Failed with status {response.status_code}")
    
    @task(2)
    def get_ride_status(self):
        """Test ride status endpoint"""
        if self.created_rides:
            ride_id = random.choice(self.created_rides)
        else:
            ride_id = str(uuid.uuid4())
        
        with self.client.get(f"/v1/rides/{ride_id}", 
                             headers=self.headers,
                             catch_response=True) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Failed with status {response.status_code}")
    
    @task(1)
    def cancel_ride(self):
        """Test ride cancellation"""
        if not self.created_rides:
            return
        
        ride_id = self.created_rides.pop(0) if self.created_rides else str(uuid.uuid4())
        
        payload = {
            "reason": "Test cancellation"
        }
        
        cancel_headers = {
            **self.headers,
            "Idempotency-Key": str(uuid.uuid4())
        }
        
        with self.client.post(f"/v1/rides/{ride_id}/cancel",
                              json=payload,
                              headers=cancel_headers,
                              catch_response=True) as response:
            if response.status_code in [200, 204, 404, 400]:
                response.success()
            else:
                response.failure(f"Failed with status {response.status_code}")


class DriverUser(HttpUser):
    """Simulates a driver updating location and accepting rides"""
    
    wait_time = between(0.5, 2)
    
    def on_start(self):
        """Setup - runs once per driver"""
        self.driver_id = random.choice(DRIVER_IDS)
        self.tenant_id = "tenant_1"
        self.headers = {
            "Content-Type": "application/json",
            "X-Tenant-ID": self.tenant_id
        }
        self.current_lat = BASE_LAT + random.uniform(-LOCATION_VARIANCE, LOCATION_VARIANCE)
        self.current_lng = BASE_LNG + random.uniform(-LOCATION_VARIANCE, LOCATION_VARIANCE)
    
    @task(5)
    def update_location(self):
        """Test driver location update - high frequency"""
        # Simulate movement
        self.current_lat += random.uniform(-0.001, 0.001)
        self.current_lng += random.uniform(-0.001, 0.001)
        
        payload = {
            "latitude": self.current_lat,
            "longitude": self.current_lng,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        }
        
        location_headers = {
            **self.headers,
            "Idempotency-Key": str(uuid.uuid4())
        }
        
        with self.client.post(f"/v1/drivers/{self.driver_id}/location",
                              json=payload,
                              headers=location_headers,
                              catch_response=True) as response:
            if response.status_code in [200, 204, 404]:
                response.success()
            else:
                response.failure(f"Failed with status {response.status_code}")
    
    @task(2)
    def update_status(self):
        """Test driver status update"""
        status = random.choice(["available", "busy", "offline"])
        
        payload = {
            "status": status
        }
        
        with self.client.put(f"/v1/drivers/{self.driver_id}/status",
                             json=payload,
                             headers=self.headers,
                             catch_response=True) as response:
            if response.status_code in [200, 204, 404]:
                response.success()
            else:
                response.failure(f"Failed with status {response.status_code}")
    
    @task(1)
    def get_driver_profile(self):
        """Test driver profile endpoint"""
        with self.client.get(f"/v1/drivers/{self.driver_id}",
                             headers=self.headers,
                             catch_response=True) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Failed with status {response.status_code}")


class MixedUser(HttpUser):
    """Mixed workload simulating both riders and general API usage"""
    
    wait_time = between(1, 5)
    
    def on_start(self):
        self.user_id = str(uuid.uuid4())
        self.tenant_id = "tenant_1"
        self.headers = {
            "Content-Type": "application/json",
            "X-Tenant-ID": self.tenant_id
        }
    
    @task(3)
    def health_check(self):
        """Test health endpoint"""
        with self.client.get("/health", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Health check failed: {response.status_code}")
    
    @task(1)
    def metrics_endpoint(self):
        """Test metrics endpoint"""
        with self.client.get("/metrics", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Metrics failed: {response.status_code}")
    
    @task(2)
    def browse_rides(self):
        """Simulate browsing/searching rides"""
        rider_id = str(uuid.uuid4())
        
        with self.client.get(f"/v1/riders/{rider_id}/rides",
                             headers=self.headers,
                             params={"limit": 10, "offset": 0},
                             catch_response=True) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Failed with status {response.status_code}")


# Custom event handlers for reporting
@events.request.add_listener
def on_request(request_type, name, response_time, response_length, exception, **kwargs):
    """Log slow requests for analysis"""
    if response_time > 1000:  # Log requests over 1 second
        print(f"SLOW REQUEST: {request_type} {name} - {response_time}ms")


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Setup before load test starts"""
    print("Starting load test for Ride Hailing Platform Phase 3")
    print(f"Target host: {environment.host}")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Cleanup after load test ends"""
    print("Load test completed")
    
    # Print summary statistics
    stats = environment.stats
    print(f"\nSummary:")
    print(f"  Total requests: {stats.total.num_requests}")
    print(f"  Failure rate: {stats.total.fail_ratio * 100:.2f}%")
    print(f"  Avg response time: {stats.total.avg_response_time:.2f}ms")
    print(f"  P95 response time: {stats.total.get_response_time_percentile(0.95):.2f}ms")

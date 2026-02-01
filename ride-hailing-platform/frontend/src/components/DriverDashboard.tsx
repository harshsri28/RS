// src/components/DriverDashboard.tsx
// Driver Dashboard with location tracking and ride acceptance

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { Icon, type LatLngExpression, type Map as LeafletMap } from 'leaflet';
import { wsService } from '../services/websocket';
import { driverApi, userApi, tripApi } from '../services/api';
import toast from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const driverIcon = new Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface RideOffer {
  ride_id: string;
  expires_at: string;
  details: {
    pickup_address?: string;
    dropoff_address?: string;
    pickup_location?: { latitude: number; longitude: number };
    dropoff_location?: { latitude: number; longitude: number };
    estimated_fare?: number;
    vehicle_type?: string;
    distance_km?: number;
  };
}

interface DriverLocation {
  lat: number;
  lng: number;
}

// Map click handler for location
const LocationUpdater: React.FC<{
  onLocationChange: (lat: number, lng: number) => void;
}> = ({ onLocationChange }) => {
  useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const DriverDashboard: React.FC = () => {
  const [location, setLocation] = useState<DriverLocation>({ lat: 12.9716, lng: 77.5946 });
  const [isAvailable, setIsAvailable] = useState(false);
  const [rideOffer, setRideOffer] = useState<RideOffer | null>(null);
  const [offerExpiry, setOfferExpiry] = useState<number>(0);
  const [currentRideId, setCurrentRideId] = useState<string | null>(null);
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [isOnTrip, setIsOnTrip] = useState(false);
  const [tripCompleted, setTripCompleted] = useState<{
    tripId: string;
    fare: number;
    distance: number;
    duration: number;
  } | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [driverId, setDriverId] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);

  const defaultCenter: LatLngExpression = [12.9716, 77.5946];

  // Initialize driver on component mount - creates a real driver/user in the database
  useEffect(() => {
    const initializeDriver = async () => {
      try {
        // Check if we have a stored driver ID (this is the driver record ID, not user ID)
        const storedDriverId = localStorage.getItem('driver_id');
        
        if (storedDriverId) {
          // Verify driver exists in database
          try {
            await driverApi.getDriver(storedDriverId);
            setDriverId(storedDriverId);
            setIsInitializing(false);
            return;
          } catch {
            // Driver doesn't exist anymore, create new one
            localStorage.removeItem('driver_id');
            localStorage.removeItem('driver_user_id');
          }
        }
        
        // Step 1: Create a new user in the database
        const timestamp = Date.now();
        const user = await userApi.createUser({
          name: `Driver ${timestamp}`,
          email: `driver${timestamp}@demo.local`,
          phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
          user_type: 'driver'
        });
        
        // Step 2: Create a driver record linked to the user
        const driver = await driverApi.createDriver({
          user_id: user.id,
          vehicle_type: 'economy',
          vehicle_number: `KA01AB${Math.floor(1000 + Math.random() * 9000)}`,
          license_number: `DL${Math.floor(100000000000 + Math.random() * 900000000000)}`
        });
        
        localStorage.setItem('driver_user_id', user.id);
        localStorage.setItem('driver_id', driver.id);
        setDriverId(driver.id);
        toast.success('Driver account created!');
      } catch (error) {
        console.error('Failed to initialize driver:', error);
        toast.error('Failed to initialize. Please refresh the page.');
      } finally {
        setIsInitializing(false);
      }
    };
    
    initializeDriver();
  }, []);

  // Handle new ride offer
  const handleRideOffer = useCallback((data: unknown) => {
    const offer = data as RideOffer;
    console.log('New ride offer received:', offer);

    setRideOffer(offer);

    // Calculate expiry countdown
    const expiresAt = new Date(offer.expires_at).getTime();
    const now = Date.now();
    setOfferExpiry(Math.max(0, Math.floor((expiresAt - now) / 1000)));

    toast('New ride request!', {
      icon: '🚗',
      duration: 15000,
    });
  }, []);

  // Handle ride status updates
  const handleRideStatusUpdate = useCallback((data: unknown) => {
    const update = data as { ride_id: string; status: string };
    console.log('Ride status update:', update);

    if (update.status === 'in_progress') {
      setIsOnTrip(true);
      toast.success('Trip started!');
    } else if (update.status === 'completed') {
      setIsOnTrip(false);
      setCurrentRideId(null);
      toast.success('Trip completed!');
    } else if (update.status === 'cancelled') {
      setIsOnTrip(false);
      setCurrentRideId(null);
      setRideOffer(null);
      toast('Ride was cancelled', { icon: '❌' });
    }
  }, []);

  // WebSocket connection
  useEffect(() => {
    if (!driverId) return; // Wait for driver initialization
    
    wsService.connect(driverId);

    wsService.on('new_ride_offer', handleRideOffer);
    wsService.on('ride_status_update', handleRideStatusUpdate);

    return () => {
      wsService.off('new_ride_offer', handleRideOffer);
      wsService.off('ride_status_update', handleRideStatusUpdate);
      wsService.disconnect();
    };
  }, [driverId, handleRideOffer, handleRideStatusUpdate]);

  // Offer expiry countdown
  useEffect(() => {
    if (rideOffer && offerExpiry > 0) {
      const timer = setTimeout(() => {
        setOfferExpiry((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    } else if (offerExpiry === 0 && rideOffer) {
      setRideOffer(null);
      toast('Ride offer expired', { icon: '⏰' });
    }
  }, [offerExpiry, rideOffer]);

  // Location updates when available
  useEffect(() => {
    if (!isAvailable || !driverId) {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
      return;
    }

    // Send initial location
    driverApi.updateLocation(driverId, location.lat, location.lng).catch(console.error);

    // Update location every 5 seconds
    locationIntervalRef.current = setInterval(() => {
      driverApi.updateLocation(driverId, location.lat, location.lng).catch(console.error);
    }, 5000);

    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, [isAvailable, driverId, location]);

  // Update driver status when availability changes
  useEffect(() => {
    if (!driverId) return; // Skip if no driver yet
    const status = isAvailable ? 'available' : 'offline';
    driverApi.updateStatus(driverId, status).catch(console.error);
  }, [isAvailable, driverId]);

  // Show loading state while initializing driver
  if (isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Setting up driver account...</p>
        </div>
      </div>
    );
  }

  const handleLocationChange = (lat: number, lng: number) => {
    setLocation({ lat, lng });
  };

  const handleUseCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLat = position.coords.latitude;
          const newLng = position.coords.longitude;
          setLocation({ lat: newLat, lng: newLng });

          if (mapRef.current) {
            mapRef.current.setView([newLat, newLng], 15);
          }

          toast.success('Location updated');
        },
        (error) => {
          console.error('Geolocation error:', error);
          toast.error('Could not get your location');
        }
      );
    }
  };

  const handleAcceptRide = async () => {
    if (!rideOffer) return;

    try {
      await driverApi.acceptRide(driverId, rideOffer.ride_id);
      setCurrentRideId(rideOffer.ride_id);
      setRideOffer(null);
      toast.success('Ride accepted! Navigate to pickup location.');
    } catch (error) {
      console.error('Failed to accept ride:', error);
      toast.error('Failed to accept ride');
    }
  };

  const handleDeclineRide = async () => {
    if (!rideOffer) return;

    try {
      await driverApi.declineRide(driverId, rideOffer.ride_id);
      setRideOffer(null);
      toast('Ride declined');
    } catch (error) {
      console.error('Failed to decline ride:', error);
      // Even if API fails, we can still dismiss the modal
      setRideOffer(null);
      toast('Ride declined');
    }
  };

  const handleStartTrip = async () => {
    if (!currentRideId) return;

    try {
      const trip = await tripApi.startTrip(currentRideId, driverId);
      setCurrentTripId(trip.tripId || trip.id || '');
      setIsOnTrip(true);
      toast.success('Trip started!');
    } catch (error) {
      console.error('Failed to start trip:', error);
      toast.error('Failed to start trip');
    }
  };

  const handleEndRide = async () => {
    if (!currentTripId) {
      console.error('No current trip ID to end');
      toast.error('No active trip to end');
      return;
    }

    try {
      const trip = await tripApi.endTrip(currentTripId, {
        latitude: location.lat,
        longitude: location.lng
      });
      
      // Show trip completed summary
      setTripCompleted({
        tripId: trip.tripId || currentTripId,
        fare: trip.totalFare || trip.final_fare || 0,
        distance: trip.distanceKm || trip.distance_km || 0,
        duration: trip.durationMinutes || trip.duration_minutes || 0
      });
      
      setIsOnTrip(false);
      setCurrentRideId(null);
      setCurrentTripId(null);
      toast.success('Trip completed! Collect payment.');
    } catch (error) {
      console.error('Failed to end trip:', error);
      toast.error('Failed to end trip');
    }
  };

  const handleDismissPayment = () => {
    setTripCompleted(null);
    setIsAvailable(true); // Go back online
  };

  const getStatusBadge = () => {
    if (isOnTrip) {
      return (
        <span className="px-3 py-1 bg-blue-500 text-white rounded-full text-sm font-medium">
          On Trip
        </span>
      );
    }
    if (currentRideId) {
      return (
        <span className="px-3 py-1 bg-yellow-500 text-white rounded-full text-sm font-medium">
          En Route to Pickup
        </span>
      );
    }
    if (isAvailable) {
      return (
        <span className="px-3 py-1 bg-green-500 text-white rounded-full text-sm font-medium">
          Available
        </span>
      );
    }
    return (
      <span className="px-3 py-1 bg-gray-500 text-white rounded-full text-sm font-medium">
        Offline
      </span>
    );
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-green-600 text-white p-4 shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Driver Dashboard</h1>
            <p className="text-sm opacity-80">Manage your rides</p>
          </div>
          {getStatusBadge()}
        </div>

        {/* Availability Toggle */}
        <div className="mt-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                disabled={isOnTrip || !!currentRideId}
                className="sr-only"
              />
              <div
                className={`w-14 h-8 rounded-full transition-colors ${
                  isAvailable ? 'bg-green-400' : 'bg-gray-300'
                } ${(isOnTrip || currentRideId) ? 'opacity-50' : ''}`}
              />
              <div
                className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  isAvailable ? 'translate-x-6' : ''
                }`}
              />
            </div>
            <span className="font-medium">
              {isAvailable ? 'Available for rides' : 'Go online to receive rides'}
            </span>
          </label>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer
            center={defaultCenter}
            zoom={13}
            className="h-full w-full"
            ref={mapRef}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />

            <LocationUpdater onLocationChange={handleLocationChange} />

            <Marker position={[location.lat, location.lng]} icon={driverIcon}>
              <Popup>Your current location</Popup>
            </Marker>
          </MapContainer>

          {/* Ride Offer Modal */}
          {rideOffer && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]">
              <div className="bg-white p-6 rounded-xl shadow-2xl w-96 max-w-[90%] animate-pulse-once">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-800">New Ride Request</h3>
                  <span className="px-3 py-1 bg-red-500 text-white rounded-full text-sm font-bold">
                    {offerExpiry}s
                  </span>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 text-lg">📍</span>
                    <div>
                      <p className="text-xs text-gray-500">Pickup</p>
                      <p className="font-medium">
                        {rideOffer.details?.pickup_address || 'Location on map'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="text-red-500 text-lg">🎯</span>
                    <div>
                      <p className="text-xs text-gray-500">Dropoff</p>
                      <p className="font-medium">
                        {rideOffer.details?.dropoff_address || 'Location on map'}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between pt-2 border-t">
                    <div>
                      <p className="text-xs text-gray-500">Estimated Fare</p>
                      <p className="font-bold text-lg text-green-600">
                        ₹{rideOffer.details?.estimated_fare?.toFixed(2) || 'N/A'}
                      </p>
                    </div>
                    {rideOffer.details?.distance_km && (
                      <div>
                        <p className="text-xs text-gray-500">Distance</p>
                        <p className="font-medium">
                          {rideOffer.details.distance_km.toFixed(1)} km
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleAcceptRide}
                    className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={handleDeclineRide}
                    className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Trip Completed / Payment Modal */}
          {tripCompleted && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]">
              <div className="bg-white p-6 rounded-xl shadow-2xl w-96 max-w-[90%]">
                <div className="text-center mb-6">
                  <div className="text-6xl mb-4">✅</div>
                  <h3 className="text-2xl font-bold text-gray-800">Trip Completed!</h3>
                  <p className="text-gray-500">Collect payment from rider</p>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex justify-between p-3 bg-green-50 rounded-lg">
                    <span className="text-gray-600">Total Fare</span>
                    <span className="font-bold text-2xl text-green-600">₹{(tripCompleted.fare ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Distance</span>
                    <span className="font-medium">{(tripCompleted.distance ?? 0).toFixed(1)} km</span>
                  </div>
                  <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Duration</span>
                    <span className="font-medium">{(tripCompleted.duration ?? 0).toFixed(0)} min</span>
                  </div>
                </div>

                <button
                  onClick={handleDismissPayment}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                >
                  Payment Collected - Go Online
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-white p-6 shadow-lg overflow-y-auto border-l">
          <h2 className="text-lg font-semibold mb-4">Your Location</h2>

          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Current Position</p>
              <p className="font-mono text-sm">
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </p>
            </div>

            <button
              onClick={handleUseCurrentLocation}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Update to Current Location
            </button>

            <p className="text-xs text-gray-500">
              Click on the map or use GPS to update your location
            </p>
          </div>

          {/* Current Ride Info */}
          {currentRideId && (
            <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <h3 className="font-semibold mb-2">Active Ride</h3>
              <p className="text-sm text-gray-600">
                Ride ID: <span className="font-mono">{currentRideId.slice(0, 8)}...</span>
              </p>
              <p className="text-sm mt-2 text-yellow-700 mb-3">
                {isOnTrip ? 'Trip in progress - drive to destination' : 'Navigate to pickup location'}
              </p>
              
              {!isOnTrip ? (
                <button
                  onClick={handleStartTrip}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Arrived - Start Trip
                </button>
              ) : (
                <button
                  onClick={handleEndRide}
                  className="w-full bg-red-600 text-white py-2 rounded-lg font-medium hover:bg-red-700 transition-colors"
                >
                  End Ride & Collect Payment
                </button>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="mt-6">
            <h3 className="font-semibold mb-3">Today's Stats</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600">0</p>
                <p className="text-xs text-gray-600">Trips</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-600">₹0</p>
                <p className="text-xs text-gray-600">Earnings</p>
              </div>
            </div>
          </div>

          {/* Driver Info */}
          <div className="mt-6 p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Driver ID:</strong> {driverId.slice(0, 20)}...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverDashboard;

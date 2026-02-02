// src/components/RiderDashboard.tsx
// Rider Dashboard with map and ride booking

import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { Icon, type LatLngExpression } from 'leaflet';
import { wsService } from '../services/websocket';
import { rideApi, userApi, type Location, type RideResponse } from '../services/api';
import toast from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const defaultIcon = new Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const driverIcon = new Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'driver-marker',
});

interface LocationWithAddress extends Location {
  address: string;
}

interface DriverLocation {
  driver_id: string;
  latitude: number;
  longitude: number;
}

// Map click handler component
const LocationPicker: React.FC<{
  onPickupSelect: (location: LocationWithAddress) => void;
  onDropoffSelect: (location: LocationWithAddress) => void;
  isSelectingPickup: boolean;
  isSelectingDropoff: boolean;
}> = ({ onPickupSelect, onDropoffSelect, isSelectingPickup, isSelectingDropoff }) => {
  useMapEvents({
    click(e) {
      const location: LocationWithAddress = {
        latitude: e.latlng.lat,
        longitude: e.latlng.lng,
        address: `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`,
      };

      if (isSelectingPickup) {
        onPickupSelect(location);
      } else if (isSelectingDropoff) {
        onDropoffSelect(location);
      }
    },
  });
  return null;
};

const RiderDashboard: React.FC = () => {
  const [pickup, setPickup] = useState<LocationWithAddress | null>(null);
  const [dropoff, setDropoff] = useState<LocationWithAddress | null>(null);
  const [currentRide, setCurrentRide] = useState<RideResponse | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [vehicleType, setVehicleType] = useState<string>('economy');
  const [paymentMethod, setPaymentMethod] = useState<string>('card');
  const [isSelectingPickup, setIsSelectingPickup] = useState(false);
  const [isSelectingDropoff, setIsSelectingDropoff] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [riderId, setRiderId] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);

  const defaultCenter: LatLngExpression = [12.9716, 77.5946]; // Bangalore

  // Initialize user on component mount - creates a real user in the database
  useEffect(() => {
    const initializeUser = async () => {
      try {
        // Check if we have a stored user ID
        const storedUserId = localStorage.getItem('rider_user_id');
        
        if (storedUserId) {
          // Verify user exists in database
          try {
            await userApi.getUser(storedUserId);
            setRiderId(storedUserId);
            setIsInitializing(false);
            return;
          } catch {
            // User doesn't exist anymore, create new one
            localStorage.removeItem('rider_user_id');
          }
        }
        
        // Create a new user in the database
        const timestamp = Date.now();
        const user = await userApi.createUser({
          name: `Rider ${timestamp}`,
          email: `rider${timestamp}@demo.local`,
          phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
          user_type: 'rider'
        });
        
        localStorage.setItem('rider_user_id', user.id);
        setRiderId(user.id);
        toast.success('Account created!');
      } catch (error) {
        console.error('Failed to initialize user:', error);
        toast.error('Failed to initialize. Please refresh the page.');
      } finally {
        setIsInitializing(false);
      }
    };
    
    initializeUser();
  }, []);

  // WebSocket event handlers
  const handleRideUpdate = useCallback((data: unknown) => {
    const update = data as { ride_id: string; status: string; driver_id?: string };
    console.log('[RiderDashboard] Ride status update received:', update);

    setCurrentRide((prev) => {
      console.log('[RiderDashboard] Previous ride:', prev?.id, 'Update for:', update.ride_id);
      if (prev && prev.id === update.ride_id) {
        const updated = { ...prev, status: update.status, driver_id: update.driver_id || prev.driver_id };
        console.log('[RiderDashboard] Updated ride:', updated);
        return updated;
      }
      return prev;
    });

    switch (update.status) {
      case 'driver_assigned':
        toast.success('Driver assigned to your ride!');
        break;
      case 'driver_arrived':
        toast.success('Your driver has arrived!');
        break;
      case 'trip_started':
      case 'in_progress':
        toast.success('Trip started!');
        break;
      case 'completed':
        toast.success('Trip completed! Thank you for riding with us.');
        // Clear the ride after completion (with short delay for user to see the message)
        setTimeout(() => setCurrentRide(null), 3000);
        break;
      case 'cancelled':
      case 'no_driver_found':
        toast('Ride was cancelled', { icon: '❌' });
        setCurrentRide(null);
        break;
    }
  }, []);

  const handleDriverLocation = useCallback((data: unknown) => {
    const location = data as DriverLocation;
    setDriverLocation(location);
  }, []);

  const handleDriverAssigned = useCallback((data: unknown) => {
    const driverInfo = data as { ride_id: string; driver: { id: string; name: string; rating: number } };
    toast.success(`Driver ${driverInfo.driver.name} is on the way!`);
  }, []);

  useEffect(() => {
    if (!riderId) return; // Wait for user initialization
    
    // Connect to WebSocket
    wsService.connect(riderId);

    // Subscribe to events
    wsService.on('ride_status_update', handleRideUpdate);
    wsService.on('driver_location_update', handleDriverLocation);
    wsService.on('driver_assigned', handleDriverAssigned);

    return () => {
      wsService.off('ride_status_update', handleRideUpdate);
      wsService.off('driver_location_update', handleDriverLocation);
      wsService.off('driver_assigned', handleDriverAssigned);
      wsService.disconnect();
    };
  }, [riderId, handleRideUpdate, handleDriverLocation, handleDriverAssigned]);

  // Show loading state while initializing user
  if (isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Setting up your account...</p>
        </div>
      </div>
    );
  }

  const handleRequestRide = async () => {
    if (!pickup || !dropoff) {
      toast.error('Please select both pickup and dropoff locations');
      return;
    }

    setIsLoading(true);

    try {
      const ride = await rideApi.createRide({
        rider_id: riderId,
        pickup_location: pickup,
        dropoff_location: dropoff,
        vehicle_type: vehicleType,
        payment_method: paymentMethod,
      });

      setCurrentRide(ride);
      toast.success('Ride requested! Searching for nearby drivers...');
    } catch (error) {
      console.error('Failed to create ride:', error);
      toast.error('Failed to create ride. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelRide = async () => {
    if (!currentRide) return;

    try {
      await rideApi.cancelRide(currentRide.id, 'User cancelled');
      setCurrentRide(null);
      setDriverLocation(null);
      toast.success('Ride cancelled');
    } catch (error) {
      console.error('Failed to cancel ride:', error);
      toast.error('Failed to cancel ride');
    }
  };

  const setCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setPickup({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            address: 'Current Location',
          });
          toast.success('Current location set as pickup');
        },
        (error) => {
          console.error('Geolocation error:', error);
          toast.error('Could not get your location');
        }
      );
    } else {
      toast.error('Geolocation is not supported');
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'text-yellow-600';
      case 'driver_assigned':
        return 'text-blue-600';
      case 'in_progress':
        return 'text-green-600';
      case 'completed':
        return 'text-gray-600';
      case 'cancelled':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-lg">
        <h1 className="text-2xl font-bold">Ride Hailing</h1>
        <p className="text-sm opacity-80">Rider Dashboard</p>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer
            center={defaultCenter}
            zoom={13}
            className="h-full w-full"
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />

            <LocationPicker
              onPickupSelect={(loc) => {
                setPickup(loc);
                setIsSelectingPickup(false);
              }}
              onDropoffSelect={(loc) => {
                setDropoff(loc);
                setIsSelectingDropoff(false);
              }}
              isSelectingPickup={isSelectingPickup}
              isSelectingDropoff={isSelectingDropoff}
            />

            {pickup && (
              <Marker position={[pickup.latitude, pickup.longitude]} icon={defaultIcon}>
                <Popup>
                  <strong>Pickup:</strong> {pickup.address}
                </Popup>
              </Marker>
            )}

            {dropoff && (
              <Marker position={[dropoff.latitude, dropoff.longitude]} icon={defaultIcon}>
                <Popup>
                  <strong>Dropoff:</strong> {dropoff.address}
                </Popup>
              </Marker>
            )}

            {driverLocation && (
              <Marker
                position={[driverLocation.latitude, driverLocation.longitude]}
                icon={driverIcon}
              >
                <Popup>Your Driver</Popup>
              </Marker>
            )}
          </MapContainer>

          {/* Map selection mode indicator */}
          {(isSelectingPickup || isSelectingDropoff) && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-[1000]">
              Click on map to select {isSelectingPickup ? 'pickup' : 'dropoff'} location
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-96 bg-white p-6 shadow-lg overflow-y-auto border-l">
          <h2 className="text-xl font-semibold mb-4">Book a Ride</h2>

          {/* Location Selection */}
          <div className="space-y-4">
            {/* Pickup */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pickup Location
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pickup?.address || ''}
                  placeholder="Select on map"
                  className="flex-1 p-2 border border-gray-300 rounded-lg bg-gray-50"
                  readOnly
                />
                <button
                  onClick={() => {
                    setIsSelectingPickup(true);
                    setIsSelectingDropoff(false);
                  }}
                  className={`px-3 py-2 rounded-lg ${
                    isSelectingPickup
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                  title="Select on map"
                >
                  📍
                </button>
              </div>
              <button
                onClick={setCurrentLocation}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                Use current location
              </button>
            </div>

            {/* Dropoff */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dropoff Location
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={dropoff?.address || ''}
                  placeholder="Select on map"
                  className="flex-1 p-2 border border-gray-300 rounded-lg bg-gray-50"
                  readOnly
                />
                <button
                  onClick={() => {
                    setIsSelectingDropoff(true);
                    setIsSelectingPickup(false);
                  }}
                  className={`px-3 py-2 rounded-lg ${
                    isSelectingDropoff
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                  title="Select on map"
                >
                  📍
                </button>
              </div>
            </div>

            {/* Vehicle Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle Type
              </label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg"
                disabled={!!currentRide}
              >
                <option value="economy">Economy</option>
                <option value="premium">Premium</option>
                <option value="luxury">Luxury</option>
                <option value="xl">XL (6+ seats)</option>
              </select>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg"
                disabled={!!currentRide}
              >
                <option value="card">Credit/Debit Card</option>
                <option value="cash">Cash</option>
                <option value="wallet">Wallet</option>
              </select>
            </div>

            {/* Request/Cancel Button */}
            {!currentRide ? (
              <button
                onClick={handleRequestRide}
                disabled={!pickup || !dropoff || isLoading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Requesting...' : 'Request Ride'}
              </button>
            ) : (
              // Only show cancel when ride is still searching for driver (not yet assigned)
              currentRide.status === 'requested' || currentRide.status === 'searching_driver' ? (
                <button
                  onClick={handleCancelRide}
                  className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                >
                  Cancel Ride
                </button>
              ) : (
                // Show ride status message instead of cancel button
                <div className="w-full bg-green-100 text-green-800 py-3 rounded-lg text-center font-medium">
                  {currentRide.status === 'driver_assigned' && 'Driver is on the way!'}
                  {(currentRide.status === 'in_progress' || currentRide.status === 'trip_started') && 'Trip in progress...'}
                  {currentRide.status === 'completed' && 'Trip completed!'}
                </div>
              )
            )}
          </div>

          {/* Current Ride Status */}
          {currentRide && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
              <h3 className="font-semibold mb-3">Current Ride</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`font-medium capitalize ${getStatusColor(currentRide.status)}`}>
                    {(currentRide.status || 'unknown').replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Ride ID:</span>
                  <span className="font-mono text-xs">{currentRide.id.slice(0, 8)}...</span>
                </div>
                {currentRide.estimated_fare != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Estimated Fare:</span>
                    <span className="font-medium">
                      ₹{typeof currentRide.estimated_fare === 'number' 
                        ? currentRide.estimated_fare.toFixed(2) 
                        : parseFloat(String(currentRide.estimated_fare)).toFixed(2)}
                    </span>
                  </div>
                )}
                {currentRide.driver_id && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Driver Assigned:</span>
                    <span className="font-medium text-green-600">Yes</span>
                  </div>
                )}
              </div>

              {/* Progress indicator */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Requested</span>
                  <span>Driver Assigned</span>
                  <span>In Progress</span>
                  <span>Completed</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-500"
                    style={{
                      width:
                        currentRide.status === 'pending'
                          ? '25%'
                          : currentRide.status === 'driver_assigned'
                          ? '50%'
                          : currentRide.status === 'in_progress'
                          ? '75%'
                          : currentRide.status === 'completed'
                          ? '100%'
                          : '0%',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* User Info */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Your ID:</strong> {riderId.slice(0, 20)}...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiderDashboard;

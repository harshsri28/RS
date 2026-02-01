// src/App.tsx
// Main application component with routing

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import RiderDashboard from './components/RiderDashboard';
import DriverDashboard from './components/DriverDashboard';

// Landing page component
const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Ride Hailing</h1>
          <p className="text-white/80">Choose your dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-4">
          <Link
            to="/rider"
            className="block w-full bg-blue-600 text-white text-center py-4 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            <span className="text-2xl mr-2">🚶</span>
            Continue as Rider
          </Link>

          <Link
            to="/driver"
            className="block w-full bg-green-600 text-white text-center py-4 rounded-xl font-semibold hover:bg-green-700 transition-colors"
          >
            <span className="text-2xl mr-2">🚗</span>
            Continue as Driver
          </Link>
        </div>

        <p className="text-center text-white/60 text-sm mt-6">
          Real-time ride hailing platform demo
        </p>
      </div>
    </div>
  );
};

// Navigation component (optional, can be added to dashboards)
const Navigation: React.FC = () => {
  const location = useLocation();

  const isRider = location.pathname === '/rider';
  const isDriver = location.pathname === '/driver';

  if (!isRider && !isDriver) return null;

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[1000]">
      <div className="bg-white rounded-full shadow-lg px-4 py-2 flex gap-2">
        <Link
          to="/rider"
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            isRider ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Rider
        </Link>
        <Link
          to="/driver"
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            isDriver ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Driver
        </Link>
        <Link
          to="/"
          className="px-4 py-2 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          Home
        </Link>
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            style: {
              background: '#10B981',
            },
          },
          error: {
            style: {
              background: '#EF4444',
            },
          },
        }}
      />
      <Navigation />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/rider" element={<RiderDashboard />} />
        <Route path="/driver" element={<DriverDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

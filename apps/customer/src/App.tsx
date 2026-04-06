import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';

// Pages
import SplashPage from '@/pages/SplashPage';
import LoginPage from '@/pages/LoginPage';
import OnboardingPage from '@/pages/OnboardingPage';
import HomePage from '@/pages/HomePage';
import RideRequestPage from '@/pages/RideRequestPage';
import MatchingPage from '@/pages/MatchingPage';
import TripActivePage from '@/pages/TripActivePage';
import TripSummaryPage from '@/pages/TripSummaryPage';
import RatingPage from '@/pages/RatingPage';
import ProfilePage from '@/pages/ProfilePage';
import HistoryPage from '@/pages/HistoryPage';
import NotificationsPage from '@/pages/NotificationsPage';

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<SplashPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* Protected Routes */}
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ride-request"
          element={
            <ProtectedRoute>
              <RideRequestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matching"
          element={
            <ProtectedRoute>
              <MatchingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trip-active"
          element={
            <ProtectedRoute>
              <TripActivePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trip-summary/:id"
          element={
            <ProtectedRoute>
              <TripSummaryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rating/:tripId"
          element={
            <ProtectedRoute>
              <RatingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

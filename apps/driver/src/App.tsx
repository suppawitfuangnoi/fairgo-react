import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';

// Pages
import SplashPage from '@/pages/SplashPage';
import LoginPage from '@/pages/LoginPage';
import OnboardingPage from '@/pages/OnboardingPage';
import OnboardingProfilePage from '@/pages/OnboardingProfilePage';
import HomePage from '@/pages/HomePage';
import SubmitOfferPage from '@/pages/SubmitOfferPage';
import TripActivePage from '@/pages/TripActivePage';
import TripSummaryPage from '@/pages/TripSummaryPage';
import EarningsPage from '@/pages/EarningsPage';
import ProfilePage from '@/pages/ProfilePage';
import RatingPage from '@/pages/RatingPage';
import HistoryPage from '@/pages/HistoryPage';

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
        <Route path="/onboarding/profile" element={<OnboardingProfilePage />} />

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
          path="/submit-offer/:rideId"
          element={
            <ProtectedRoute>
              <SubmitOfferPage />
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
          path="/earnings"
          element={
            <ProtectedRoute>
              <EarningsPage />
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
          path="/rating/:tripId"
          element={
            <ProtectedRoute>
              <RatingPage />
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

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

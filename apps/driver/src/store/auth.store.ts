import { create } from 'zustand';

export interface DriverProfile {
  id: string;
  phone: string;
  name: string;
  email?: string;
  avatar?: string;
  rating?: number;
  totalTrips?: number;
  isOnline?: boolean;
  vehicleType?: 'TAXI' | 'MOTORCYCLE' | 'TUKTUK';
  role: 'DRIVER';
  verificationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface Vehicle {
  id: string;
  type: 'TAXI' | 'MOTORCYCLE' | 'TUKTUK';
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  year: number;
}

interface AuthState {
  user: DriverProfile | null;
  token: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  setAuth: (user: DriverProfile, token: string, refreshToken?: string) => void;
  updateUser: (user: Partial<DriverProfile>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedToken = localStorage.getItem('fg_access_token');
  const storedRefreshToken = localStorage.getItem('fg_refresh_token');
  const storedUser = localStorage.getItem('fg_user');

  return {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken,
    refreshToken: storedRefreshToken,
    isLoggedIn: !!storedToken,

    setAuth: (user: DriverProfile, token: string, refreshToken?: string) => {
      localStorage.setItem('fg_user', JSON.stringify(user));
      localStorage.setItem('fg_access_token', token);
      if (refreshToken) {
        localStorage.setItem('fg_refresh_token', refreshToken);
      }
      set({ user, token, refreshToken: refreshToken || storedRefreshToken, isLoggedIn: true });
    },

    updateUser: (updates: Partial<DriverProfile>) => {
      set((state) => {
        if (state.user) {
          const updated = { ...state.user, ...updates };
          localStorage.setItem('fg_user', JSON.stringify(updated));
          return { user: updated };
        }
        return {};
      });
    },

    logout: () => {
      localStorage.removeItem('fg_user');
      localStorage.removeItem('fg_access_token');
      localStorage.removeItem('fg_refresh_token');
      set({ user: null, token: null, refreshToken: null, isLoggedIn: false });
    },
  };
});

import { create } from 'zustand';

export interface User {
  id: string;
  phone: string;
  name: string;
  email?: string;
  profilePicture?: string;
  vehicleInfo?: {
    brand: string;
    model: string;
    licensePlate: string;
  };
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedToken = localStorage.getItem('driver_token');
  const storedUser = localStorage.getItem('driver_user');

  return {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken,
    isLoggedIn: !!storedToken,

    setAuth: (user: User, token: string) => {
      localStorage.setItem('driver_user', JSON.stringify(user));
      localStorage.setItem('driver_token', token);
      set({ user, token, isLoggedIn: true });
    },

    logout: () => {
      localStorage.removeItem('driver_user');
      localStorage.removeItem('driver_token');
      set({ user: null, token: null, isLoggedIn: false });
    },
  };
});

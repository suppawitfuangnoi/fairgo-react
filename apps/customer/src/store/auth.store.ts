import { create } from 'zustand';

export interface User {
  id: string;
  phone: string;
  name: string;
  email?: string;
  profilePicture?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedToken = localStorage.getItem('customer_token');
  const storedUser = localStorage.getItem('customer_user');

  return {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken,
    isLoggedIn: !!storedToken,

    setAuth: (user: User, token: string) => {
      localStorage.setItem('customer_user', JSON.stringify(user));
      localStorage.setItem('customer_token', token);
      set({ user, token, isLoggedIn: true });
    },

    logout: () => {
      localStorage.removeItem('customer_user');
      localStorage.removeItem('customer_token');
      set({ user: null, token: null, isLoggedIn: false });
    },
  };
});

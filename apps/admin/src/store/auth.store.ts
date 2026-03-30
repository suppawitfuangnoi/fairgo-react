import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'super_admin';
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;
  setAuth: (user: User, token: string, refreshToken?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedToken = localStorage.getItem('fg_access_token');
  const storedUser = localStorage.getItem('fg_user');

  return {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken,
    isLoggedIn: !!storedToken,

    setAuth: (user: User, token: string, refreshToken?: string) => {
      localStorage.setItem('fg_user', JSON.stringify(user));
      localStorage.setItem('fg_access_token', token);
      if (refreshToken) {
        localStorage.setItem('fg_refresh_token', refreshToken);
      }
      set({ user, token, isLoggedIn: true });
    },

    logout: () => {
      localStorage.removeItem('fg_user');
      localStorage.removeItem('fg_access_token');
      localStorage.removeItem('fg_refresh_token');
      set({ user: null, token: null, isLoggedIn: false });
    },
  };
});

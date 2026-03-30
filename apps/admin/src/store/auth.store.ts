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
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedToken = localStorage.getItem('admin_token');
  const storedUser = localStorage.getItem('admin_user');

  return {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken,
    isLoggedIn: !!storedToken,

    setAuth: (user: User, token: string) => {
      localStorage.setItem('admin_user', JSON.stringify(user));
      localStorage.setItem('admin_token', token);
      set({ user, token, isLoggedIn: true });
    },

    logout: () => {
      localStorage.removeItem('admin_user');
      localStorage.removeItem('admin_token');
      set({ user: null, token: null, isLoggedIn: false });
    },
  };
});

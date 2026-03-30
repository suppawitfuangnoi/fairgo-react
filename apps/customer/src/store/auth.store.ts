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
  setLoggedIn: (loggedIn: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedToken = localStorage.getItem('fg_access_token');
  const storedUser = localStorage.getItem('fg_user');

  return {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken,
    isLoggedIn: !!storedToken,

    setAuth: (user: User, token: string) => {
      localStorage.setItem('fg_user', JSON.stringify(user));
      localStorage.setItem('fg_access_token', token);
      set({ user, token, isLoggedIn: true });
    },

    setLoggedIn: (loggedIn: boolean) => {
      set({ isLoggedIn: loggedIn });
      if (!loggedIn) {
        localStorage.removeItem('fg_access_token');
        localStorage.removeItem('fg_refresh_token');
        localStorage.removeItem('fg_user');
        set({ user: null, token: null });
      }
    },

    logout: () => {
      localStorage.removeItem('fg_user');
      localStorage.removeItem('fg_access_token');
      localStorage.removeItem('fg_refresh_token');
      set({ user: null, token: null, isLoggedIn: false });
    },
  };
});

import { authStore } from './auth';

const BASE_URL = (typeof window !== 'undefined' && (window as any).__FAIRGO_API__)
  || import.meta?.env?.VITE_API_URL
  || 'https://fairgo-api.vercel.app/api/v1';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

async function refreshTokens(): Promise<boolean> {
  const refresh = authStore.getRefresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) { authStore.clear(); return false; }
    const data = await res.json();
    authStore.setTokens(data.data.accessToken, data.data.refreshToken);
    return true;
  } catch {
    authStore.clear();
    return false;
  }
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: {
    method?: Method;
    body?: unknown;
    token?: string | null;
    skipAuth?: boolean;
    isFormData?: boolean;
  } = {}
): Promise<T> {
  const { method = 'GET', body, skipAuth = false, isFormData = false } = options;
  const token = options.token ?? authStore.getAccess();

  const headers: Record<string, string> = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (token && !skipAuth) headers['Authorization'] = `Bearer ${token}`;

  const fetchOptions: RequestInit = {
    method,
    headers,
    body: body ? (isFormData ? body as FormData : JSON.stringify(body)) : undefined,
  };

  let res = await fetch(`${BASE_URL}${endpoint}`, fetchOptions);

  // Auto-refresh on 401
  if (res.status === 401 && !skipAuth) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${authStore.getAccess()}`;
      res = await fetch(`${BASE_URL}${endpoint}`, { ...fetchOptions, headers });
    } else {
      authStore.clear();
      window.location.href = '/login';
      throw new ApiError(401, 'Session expired');
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// Convenience methods
export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T>(url: string, body?: unknown) => apiFetch<T>(url, { method: 'POST', body }),
  patch: <T>(url: string, body?: unknown) => apiFetch<T>(url, { method: 'PATCH', body }),
  put: <T>(url: string, body?: unknown) => apiFetch<T>(url, { method: 'PUT', body }),
  delete: <T>(url: string) => apiFetch<T>(url, { method: 'DELETE' }),
};

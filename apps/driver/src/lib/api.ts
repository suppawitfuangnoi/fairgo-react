const BASE = import.meta.env.VITE_API_URL || 'https://fairgo-react-production.up.railway.app/api/v1';

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem('fg_refresh_token');
      if (!refreshToken) return null;

      const res = await fetch(BASE + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        localStorage.removeItem('fg_access_token');
        localStorage.removeItem('fg_refresh_token');
        window.location.href = '/login';
        return null;
      }
      const json = await res.json();
      const newToken = json.data?.accessToken ?? json.accessToken;
      const newRefresh = json.data?.refreshToken ?? json.refreshToken;
      if (newToken) localStorage.setItem('fg_access_token', newToken);
      if (newRefresh) localStorage.setItem('fg_refresh_token', newRefresh);
      return newToken ?? null;
    } catch {
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  opt: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = localStorage.getItem('fg_access_token');
  const res = await fetch(BASE + path, {
    method: opt.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });

  // Auto-refresh on 401
  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      const retry = await fetch(BASE + path, {
        method: opt.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
        },
        body: opt.body ? JSON.stringify(opt.body) : undefined,
      });
      const retryJson = await retry.json().catch(() => ({}));
      if (!retry.ok) throw new Error(retryJson.message || retryJson.error || `HTTP ${retry.status}`);
      return (retryJson.data !== undefined ? retryJson.data : retryJson) as T;
    }
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
  // Auto-unwrap standard API envelope { success, data, message }
  return (json.data !== undefined ? json.data : json) as T;
}

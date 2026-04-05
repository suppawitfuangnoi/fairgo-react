const BASE = import.meta.env.VITE_API_URL || 'https://fairgo-react-production.up.railway.app/api/v1';

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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

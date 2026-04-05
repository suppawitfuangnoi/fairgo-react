const BASE = import.meta.env.VITE_API_URL || 'https://fairgo-react-production.up.railway.app/api/v1';

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = localStorage.getItem('fg_access_token');
  const res = await fetch(BASE + path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
  // Auto-unwrap standard API envelope { success, data, message }
  return (json.data !== undefined ? json.data : json) as T;
}

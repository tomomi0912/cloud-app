const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(BASE + path, init);
}

export interface SessionUser {
  id: string;
  telegramUserId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  role: 'ADMIN' | 'CONTRIBUTOR' | 'VIEWER';
  regions: string[];
}

let token = localStorage.getItem('sessionToken') ?? '';

export function setToken(value: string) {
  token = value;
  localStorage.setItem('sessionToken', value);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  const data = (await response.json().catch(() => null)) as {
    error?: { message?: string; requestId?: string };
  } | null;
  if (!response.ok) {
    const suffix = data?.error?.requestId ? ` (${data.error.requestId})` : '';
    throw new Error(`${data?.error?.message ?? 'Request failed'}${suffix}`);
  }
  return data as T;
}

export async function authenticate(): Promise<SessionUser> {
  const telegram = window.Telegram?.WebApp;
  telegram?.ready();
  telegram?.expand();
  const initData = telegram?.initData;
  const result = initData
    ? await api<{ token: string; user: SessionUser }>('/api/auth/telegram', {
        method: 'POST',
        body: JSON.stringify({ initData }),
      })
    : await api<{ token: string; user: SessionUser }>('/api/auth/dev', {
        method: 'POST',
        body: JSON.stringify({ telegramUserId: '100000001' }),
      });
  setToken(result.token);
  return result.user;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe?: { start_param?: string };
        ready(): void;
        expand(): void;
        themeParams: Record<string, string>;
        HapticFeedback?: { notificationOccurred(type: 'success' | 'error' | 'warning'): void };
      };
    };
  }
}

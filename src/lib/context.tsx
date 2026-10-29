import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Config, User } from '../../shared/contracts';
import { api, ApiError } from './api';

type Me = {
  user: User;
  usage: { inputTokens: number; outputTokens: number; costMicros: number; reservedMicros: number };
  limitMicros: number;
  maintenance: boolean;
};
const AuthContext = createContext<{
  me: Me | null;
  config: Config | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}>({ me: null, config: null, loading: true, error: '', refresh: async () => {} });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setError('');
    try {
      const configuration = await api<Config>('/config');
      setConfig(configuration);
      try {
        setMe(await api<Me>('/me'));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setMe(null);
        else throw e;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接服务失败。');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <AuthContext.Provider value={{ me, config, loading, error, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
const ToastContext = createContext<(message: string, type?: 'error' | 'success') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string; type: string }[]>([]);
  const notify = useCallback((message: string, type = 'success') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 6500);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((item) => (
          <button
            key={item.id}
            className={`toast ${item.type}`}
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
          >
            {item.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function useTheme() {
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem('hori-theme') ??
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('hori-theme', theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}

import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, ToastProvider, useAuth } from './lib/context';
import { ErrorBoundary, Spinner, ErrorBox } from './components/ui';
import { Landing, Pricing } from './pages/Landing';
import { AuthPage } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { SettingsPage } from './pages/Settings';
import './styles.css';
const Workspace = lazy(() => import('./pages/Workspace'));
const Admin = lazy(() => import('./pages/Admin'));
function Protected({ children }: { children: React.ReactNode }) {
  const { me, loading, error, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} retry={() => void refresh()} />;
  return me ? (
    <>{children}</>
  ) : (
    <Navigate to="/login" state={{ from: location.pathname }} replace />
  );
}
function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/login" element={<AuthPage />} />
                <Route path="/register" element={<AuthPage register />} />
                <Route
                  path="/dashboard"
                  element={
                    <Protected>
                      <Dashboard />
                    </Protected>
                  }
                />
                <Route
                  path="/projects"
                  element={
                    <Protected>
                      <Dashboard projectsOnly />
                    </Protected>
                  }
                />
                <Route
                  path="/workspace/:projectId/:taskId?"
                  element={
                    <Protected>
                      <Workspace />
                    </Protected>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <Protected>
                      <SettingsPage />
                    </Protected>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <Protected>
                      <Admin />
                    </Protected>
                  }
                />
                <Route
                  path="*"
                  element={
                    <div className="fatal-error">
                      <h1>404</h1>
                      <p>这个页面还没有被创造。</p>
                      <a className="button primary" href="/">
                        返回首页
                      </a>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

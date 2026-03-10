import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { usePlugins } from './PluginContext';
import { useAuth } from './AuthContext';
import components from './components';
import MainLayout from './layouts/MainLayout';

function ProtectedRoute({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function AppRouter() {
  const { routes, loading } = usePlugins();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  const publicRoutes = routes.filter((r) => r.public);
  const protectedRoutes = routes.filter((r) => !r.public);

  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <Routes>
        {/* Public routes (no layout) */}
        {publicRoutes.map((route) => {
          const Component = components[route.component];
          return Component ? (
            <Route key={route.path} path={route.path} element={<Component />} />
          ) : null;
        })}

        {/* Protected routes (with layout) */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          {protectedRoutes.map((route) => {
            const Component = components[route.component];
            return Component ? (
              <Route key={route.path} path={route.path} element={<Component />} />
            ) : null;
          })}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

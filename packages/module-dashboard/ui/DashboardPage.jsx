import { useState, useEffect } from 'react';
import { useAuth } from '@stratum/ui-shell/src/AuthContext';

export default function DashboardPage() {
  const { authFetch, user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    authFetch('/api/dashboard/stats')
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {});
  }, [authFetch]);

  return (
    <div className="page">
      <h2>Dashboard</h2>
      <p>Welcome back, {user?.username}!</p>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.users}</span>
            <span className="stat-label">Users</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.roles}</span>
            <span className="stat-label">Roles</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{Math.floor(stats.uptime)}s</span>
            <span className="stat-label">Uptime</span>
          </div>
        </div>
      )}
    </div>
  );
}

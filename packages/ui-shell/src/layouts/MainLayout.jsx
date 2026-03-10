import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { usePlugins } from '../PluginContext';
import { useAuth } from '../AuthContext';
import * as icons from 'lucide-react';

export default function MainLayout() {
  const { nav } = usePlugins();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Stratum</h1>
        </div>
        <nav className="sidebar-nav">
          {nav.map((item) => {
            const Icon = icons[item.icon] || icons.Circle;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="user-name">{user?.username}</span>
          <button onClick={handleLogout} className="btn-logout">
            Logout
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

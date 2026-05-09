import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api }    from '../api.js';

const NAV = [
  { to: '/dashboard',       icon: '⊞', label: 'Dashboard'     },
  { to: '/messages',        icon: '✉',  label: 'Messages'      },
  { to: '/summary',         icon: '◎',  label: 'Summary'       },
  { to: '/pending-replies', icon: '✎',  label: 'Pending',  badge: true },
  { to: '/settings',        icon: '⚙',  label: 'Settings'      },
  { to: '/billing',         icon: '✦',  label: 'Billing'       },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  // Poll pending reply count every 30s so the badge stays fresh
  useEffect(() => {
    function poll() {
      api.getPendingReplies()
        .then((res) => setPendingCount(res.total ?? 0))
        .catch(() => {});
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">✉</span>
          <span className="brand-name">Messagent</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ to, icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
              {badge && pendingCount > 0 && (
                <span className="nav-badge">{pendingCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-row">
            <div className="user-avatar">{user?.email?.[0]?.toUpperCase() ?? '?'}</div>
            <div className="user-info">
              <div className="user-email">{user?.email}</div>
              <div className="user-tier">{user?.tier ?? 'free'} plan</div>
            </div>
          </div>
          <button className="btn-ghost logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

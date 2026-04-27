import { useState, useEffect, useCallback } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close sidebar on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const linkClasses = ({ isActive }: { isActive: boolean }) =>
    `sidebar-nav-item ${isActive ? 'active' : ''}`;

  const isOrgAdmin = user?.role === 'org_admin' || user?.role === 'platform_admin';
  const isPlatformAdmin = user?.role === 'platform_admin';

  const userInitials = user?.fullName
    ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="flex min-h-screen" style={{ background: '#131313' }}>
      {/* Mobile Top Bar */}
      <div className="mobile-topbar">
        <button
          className="hamburger-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          id="btn-hamburger"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Link
          to="/"
          className="flex items-center gap-2"
          style={{ textDecoration: 'none' }}
        >
          <div style={{ width: 28, height: 28, background: '#bef264', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#131f00' }}>shield_lock</span>
          </div>
          <span style={{ fontWeight: 700, color: '#bef264', fontSize: '1rem', fontFamily: "'Space Grotesk', sans-serif", textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Securum</span>
        </Link>
      </div>

      {/* Sidebar Backdrop (mobile only) */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'sidebar-backdrop-visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {/* Logo area */}
        <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid rgba(190,242,100,0.08)' }}>
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="flex items-center gap-3"
              style={{ textDecoration: 'none' }}
              onClick={() => setSidebarOpen(false)}
            >
              <div
                className="flex items-center justify-center"
                style={{ width: 36, height: 36, background: '#bef264' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#131f00' }}>shield_lock</span>
              </div>
              <div>
                <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#bef264', fontFamily: "'Space Grotesk', sans-serif", textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1.2 }}>Securum</h1>
                <p style={{ fontSize: '0.55rem', color: '#52525b', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif" }}>
                  {user?.orgName || 'Platform'}
                </p>
              </div>
            </Link>
            {/* Close button — only visible on mobile via CSS */}
            <button
              className="sidebar-close-btn hamburger-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              id="btn-close-sidebar"
              style={{ width: 32, height: 32 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
          {/* Analytics Section */}
          <div className="sidebar-section-label">Analytics</div>

          <NavLink to="/dashboard" end className={linkClasses} id="nav-home">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>dashboard</span>
            Overview
          </NavLink>

          <NavLink to="/dashboard/query" className={linkClasses} id="nav-query">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>search</span>
            Query Builder
          </NavLink>

          <NavLink to="/dashboard/history" className={linkClasses} id="nav-history">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>schedule</span>
            History
          </NavLink>

          {/* Organization Section */}
          <div className="sidebar-section-label">Organization</div>

          <NavLink to="/dashboard/budget" className={linkClasses} id="nav-budget">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>privacy_tip</span>
            Privacy Budget
          </NavLink>

          {isOrgAdmin && (
            <>
              <NavLink to="/dashboard/settings" className={linkClasses} id="nav-settings">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>settings</span>
                Settings
              </NavLink>

              <NavLink to="/dashboard/team" className={linkClasses} id="nav-team">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>group</span>
                Team
              </NavLink>
            </>
          )}

          {/* Admin Section */}
          {isPlatformAdmin && (
            <>
              <div className="sidebar-section-label">Admin</div>

              <NavLink to="/admin" end className={linkClasses} id="nav-admin">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>admin_panel_settings</span>
                Overview
              </NavLink>

              <NavLink to="/admin/orgs" className={linkClasses} id="nav-admin-orgs">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>apartment</span>
                Organizations
              </NavLink>

              <NavLink to="/admin/users" className={linkClasses} id="nav-admin-users">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>manage_accounts</span>
                Users
              </NavLink>
            </>
          )}
        </nav>

        {/* User Info & Logout */}
        <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(190,242,100,0.08)' }}>
          <div className="flex items-center gap-3" style={{ padding: '0.5rem 0.75rem', marginBottom: '0.5rem' }}>
            <div className="flex items-center justify-center" style={{ width: 32, height: 32, background: 'rgba(190,242,100,0.15)', fontSize: '0.7rem', fontWeight: 700, color: '#bef264', fontFamily: "'Space Grotesk', sans-serif" }}>
              {userInitials}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e5e2e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.fullName || 'User'}</p>
              <p style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{user?.role?.replace('_', ' ') || 'Unknown'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            id="btn-logout"
            className="sidebar-nav-item"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: '#71717a' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { logout } = useAuth();
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

  return (
    <div className="flex min-h-screen" style={{ background: '#080B14' }}>
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
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366F1, #14B8A6)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, color: '#F8FAFC', fontSize: '1rem', letterSpacing: '-0.02em' }}>Securum</span>
        </div>
      </div>

      {/* Sidebar Backdrop (mobile only) */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'sidebar-backdrop-visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {/* Logo area */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(99,102,241,0.1)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #6366F1, #14B8A6)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <h1 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.02em', lineHeight: 1.2 }}>Securum</h1>
                <p style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Analytics</p>
              </div>
            </div>
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
        <nav style={{ flex: 1, padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column' as const, gap: '0.25rem' }}>
          <NavLink to="/" end className={linkClasses} id="nav-home">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Overview
          </NavLink>

          <NavLink to="/query" className={linkClasses} id="nav-query">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            Query Builder
          </NavLink>

          <NavLink to="/history" className={linkClasses} id="nav-history">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            History
          </NavLink>
        </nav>

        {/* Logout */}
        <div style={{ padding: '1rem', borderTop: '1px solid rgba(99,102,241,0.1)' }}>
          <button
            onClick={handleLogout}
            id="btn-logout"
            className="sidebar-nav-item"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
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

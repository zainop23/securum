import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

interface AdminStats {
  totalOrgs: number;
  activeOrgs: number;
  pendingOrgs: number;
  totalUsers: number;
  totalQueries: number;
  totalEpsilonSpent: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await client.get('/admin/stats');
        setStats(data);
      } catch (err) {
        console.error('Failed to fetch admin stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 32, width: 280 }} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton" style={{ height: 120 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <p style={{ color: '#71717a' }}>Failed to load admin data</p>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Organizations', value: stats.totalOrgs, icon: 'apartment', color: '#bef264' },
    { label: 'Active Organizations', value: stats.activeOrgs, icon: 'check_circle', color: '#4edea3' },
    { label: 'Pending Organizations', value: stats.pendingOrgs, icon: 'pending', color: '#FCD34D' },
    { label: 'Total Users', value: stats.totalUsers, icon: 'group', color: '#bef264' },
    { label: 'Total Queries', value: stats.totalQueries, icon: 'analytics', color: '#00dbe9' },
    { label: 'Total ε Spent', value: stats.totalEpsilonSpent.toFixed(2), icon: 'privacy_tip', color: '#FCD34D' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div className="animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: '#bef264' }}>admin_panel_settings</span>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>Platform Admin</h1>
            <p style={{ color: '#71717a', marginTop: '0.125rem', fontSize: '0.9rem' }}>Platform-wide overview and management</p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card, i) => (
          <div key={card.label} className="glass-card animate-slide-up" style={{ padding: '1.5rem', animationDelay: `${i * 0.06}s` }}>
            <div className="flex items-start justify-between">
              <div>
                <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>{card.label}</p>
                <p style={{ fontSize: '2.25rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", marginTop: '0.5rem', lineHeight: 1 }}>{card.value}</p>
              </div>
              <div className="flex items-center justify-center" style={{ width: 40, height: 40, background: `${card.color}15`, border: `1px solid ${card.color}25` }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: card.color }}>{card.icon}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="flex gap-4 flex-wrap animate-fade-in" style={{ animationDelay: '0.4s' }}>
        <Link to="/admin/orgs" className="btn-primary" style={{ padding: '10px 20px', fontSize: '0.75rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>apartment</span>
          Manage Organizations
        </Link>
        <Link to="/admin/users" className="btn-secondary" style={{ padding: '10px 20px', fontSize: '0.75rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>group</span>
          Manage Users
        </Link>
      </div>
    </div>
  );
}

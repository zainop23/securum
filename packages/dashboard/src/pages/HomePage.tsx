import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

interface QueryRow {
  query_id: string;
  status: string;
  submitted_by: string;
  created_at: string;
}

export default function HomePage() {
  const { user } = useAuth();
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const queriesRes = await client.get('/results');
        setQueries(queriesRes.data.results || []);
      } catch (err) {
        console.error('Failed to fetch overview data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const recentQueries = queries.slice(0, 5);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 32, width: 200 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 144 }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 256 }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 mb-2">
          <span style={{ width: 8, height: 8, background: '#bef264', borderRadius: '50%' }} className="animate-pulse" />
          <span style={{ fontFamily: 'monospace', color: '#bef264', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '0.65rem' }}>System Active</span>
        </div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>
          Dashboard Overview
        </h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem', fontSize: '0.9rem' }}>
          Welcome back, {user?.fullName || 'Operator'}
        </p>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {/* Total Queries Card */}
        <div className="glass-card animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.1s' }}>
          <div className="flex items-start justify-between">
            <div>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>Total Queries</p>
              <p style={{ fontSize: '2.5rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", marginTop: '0.5rem', lineHeight: 1 }}>{queries.length}</p>
              <p style={{ fontSize: '0.75rem', color: '#4edea3', marginTop: '0.5rem', fontWeight: 600 }}>Executed</p>
            </div>
            <div className="flex items-center justify-center" style={{ width: 40, height: 40, background: 'rgba(190,242,100,0.1)', border: '1px solid rgba(190,242,100,0.15)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#bef264' }}>analytics</span>
            </div>
          </div>
        </div>

        {/* Success Rate Card */}
        <div className="glass-card animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.2s' }}>
          <div className="flex items-start justify-between">
            <div>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>Success Rate</p>
              <p style={{ fontSize: '2.5rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", marginTop: '0.5rem', lineHeight: 1 }}>
                {queries.length > 0
                  ? `${Math.round((queries.filter((q) => q.status === 'done').length / queries.length) * 100)}%`
                  : '—'}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#4edea3', marginTop: '0.5rem', fontWeight: 600 }}>
                {queries.filter((q) => q.status === 'done').length} completed
              </p>
            </div>
            <div className="flex items-center justify-center" style={{ width: 40, height: 40, background: 'rgba(78,222,163,0.1)', border: '1px solid rgba(78,222,163,0.15)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#4edea3' }}>check_circle</span>
            </div>
          </div>
        </div>

        {/* Role Card */}
        <div className="glass-card animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.3s' }}>
          <div className="flex items-start justify-between">
            <div>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>Your Role</p>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#bef264', fontFamily: "'Space Grotesk', sans-serif", marginTop: '0.5rem', textTransform: 'uppercase' }}>
                {user?.role?.replace('_', ' ') || '—'}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.5rem', fontWeight: 500 }}>
                {user?.orgName || 'Platform'}
              </p>
            </div>
            <div className="flex items-center justify-center" style={{ width: 40, height: 40, background: 'rgba(190,242,100,0.1)', border: '1px solid rgba(190,242,100,0.15)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#bef264' }}>person</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 animate-fade-in flex-wrap" style={{ animationDelay: '0.4s' }}>
        <Link to="/dashboard/query" className="btn-primary" id="btn-go-query" style={{ padding: '10px 20px', fontSize: '0.75rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          New Query
        </Link>
        <Link to="/dashboard/history" className="btn-secondary" id="btn-go-history" style={{ padding: '10px 20px', fontSize: '0.75rem' }}>
          View All History
        </Link>
      </div>

      {/* Recent Queries */}
      <div className="glass-card-static animate-slide-up" style={{ overflow: 'hidden', animationDelay: '0.5s' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(190,242,100,0.05)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif" }}>Recent Queries</h2>
        </div>
        {recentQueries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: '#52525b', display: 'block', marginBottom: '0.75rem' }}>search</span>
            <p style={{ color: '#71717a' }}>No queries yet.</p>
            <p style={{ color: '#52525b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              <Link to="/dashboard/query" style={{ color: '#bef264', textDecoration: 'none' }}>
                Run your first query →
              </Link>
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} className="responsive-table">
              <thead>
                <tr>
                  {['Query ID', 'Status', 'Submitted By', 'Time', 'Action'].map((h) => (
                    <th key={h} style={{ textAlign: h === 'Action' ? 'right' : 'left', padding: '0.75rem 1.25rem', fontSize: '0.6rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentQueries.map((q) => (
                  <tr key={q.query_id} style={{ borderTop: '1px solid rgba(190,242,100,0.05)' }}>
                    <td style={{ padding: '0.75rem 1.25rem' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#a1a1aa', background: 'rgba(42,42,42,0.5)', padding: '0.15rem 0.5rem' }}>
                        {q.query_id.slice(0, 8)}…
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem' }}>
                      <span className={`badge badge-${q.status}`}>● {q.status}</span>
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem', fontSize: '0.85rem', color: '#a1a1aa' }}>{q.submitted_by}</td>
                    <td style={{ padding: '0.75rem 1.25rem', fontSize: '0.8rem', color: '#52525b' }}>
                      {new Date(q.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>
                      <Link to={`/dashboard/results/${q.query_id}`} style={{ fontSize: '0.8rem', color: '#bef264', textDecoration: 'none', fontWeight: 600 }}>
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

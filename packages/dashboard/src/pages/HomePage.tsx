import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

interface Org {
  id: string;
  name: string;
  endpoint_url: string;
  status: string;
  created_at: string;
}

interface QueryRow {
  query_id: string;
  status: string;
  submitted_by: string;
  created_at: string;
}

export default function HomePage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [orgsRes, queriesRes] = await Promise.all([
          client.get('/orgs'),
          client.get('/results'),
        ]);
        setOrgs(orgsRes.data.orgs || []);
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
            <div key={i} className="skeleton" style={{ height: 144, borderRadius: 16 }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 256, borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div className="animate-fade-in">
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.02em' }}>Dashboard Overview</h1>
        <p style={{ color: '#94A3B8', marginTop: '0.25rem' }}>Monitor your secure analytics platform</p>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        {/* Orgs Card */}
        <div className="glass-card animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.1s' }}>
          <div className="flex items-start justify-between">
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Organizations</p>
              <p style={{ fontSize: '2.5rem', fontWeight: 700, color: '#F8FAFC', marginTop: '0.5rem', lineHeight: 1 }}>{orgs.length}</p>
              <p style={{ fontSize: '0.8rem', color: '#14B8A6', marginTop: '0.5rem', fontWeight: 500 }}>Connected & Active</p>
            </div>
            <div
              className="flex items-center justify-center"
              style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(99,102,241,0.12)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
        </div>

        {/* Total Queries Card */}
        <div className="glass-card animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.2s' }}>
          <div className="flex items-start justify-between">
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Queries</p>
              <p style={{ fontSize: '2.5rem', fontWeight: 700, color: '#F8FAFC', marginTop: '0.5rem', lineHeight: 1 }}>{queries.length}</p>
              <p style={{ fontSize: '0.8rem', color: '#14B8A6', marginTop: '0.5rem', fontWeight: 500 }}>Executed</p>
            </div>
            <div
              className="flex items-center justify-center"
              style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(20,184,166,0.12)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
          </div>
        </div>

        {/* Success Rate Card */}
        <div className="glass-card animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.3s' }}>
          <div className="flex items-start justify-between">
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Success Rate</p>
              <p style={{ fontSize: '2.5rem', fontWeight: 700, color: '#F8FAFC', marginTop: '0.5rem', lineHeight: 1 }}>
                {queries.length > 0
                  ? `${Math.round((queries.filter((q) => q.status === 'done').length / queries.length) * 100)}%`
                  : '—'}
              </p>
              <p style={{ fontSize: '0.8rem', color: '#14B8A6', marginTop: '0.5rem', fontWeight: 500 }}>
                {queries.filter((q) => q.status === 'done').length} completed
              </p>
            </div>
            <div
              className="flex items-center justify-center"
              style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(20,184,166,0.12)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 animate-fade-in flex-wrap" style={{ animationDelay: '0.4s' }}>
        <Link to="/query" className="btn-primary" id="btn-go-query">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Query
        </Link>
        <Link
          to="/history"
          className="btn-secondary"
          id="btn-go-history"
        >
          View All History
        </Link>
      </div>

      {/* Recent Queries */}
      <div className="glass-card-static animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.5s' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#F8FAFC', marginBottom: '1rem' }}>Recent Queries</h2>
        {recentQueries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <div
              className="flex items-center justify-center"
              style={{ width: 64, height: 64, borderRadius: 9999, background: 'rgba(30,45,64,0.5)', margin: '0 auto 1rem' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <p style={{ color: '#94A3B8' }}>No queries yet.</p>
            <p style={{ color: '#64748B', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              <Link to="/query" style={{ color: '#818cf8', textDecoration: 'none' }}>
                Run your first query →
              </Link>
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} className="responsive-table">
              <thead>
                <tr style={{ borderBottom: '1px solid #1E2D40' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Query ID</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Submitted By</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Time</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentQueries.map((q) => (
                  <tr key={q.query_id} style={{ borderBottom: '1px solid rgba(30,45,64,0.5)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontFamily: 'monospace', color: '#94A3B8' }}>
                      {q.query_id.slice(0, 8)}…
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className={`badge badge-${q.status}`}>
                        ● {q.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#94A3B8' }}>{q.submitted_by}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#64748B' }}>
                      {new Date(q.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <Link
                        to={`/results/${q.query_id}`}
                        style={{ fontSize: '0.875rem', color: '#818cf8', textDecoration: 'none', fontWeight: 500 }}
                      >
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

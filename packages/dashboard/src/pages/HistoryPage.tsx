import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

interface QueryRow {
  query_id: string;
  status: string;
  submitted_by: string;
  created_at: string;
}

export default function HistoryPage() {
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await client.get('/results');
        setQueries(res.data.results || []);
      } catch (err) {
        console.error('Failed to fetch history:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 32, width: 200 }} />
        <div className="skeleton" style={{ height: 384, borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in flex-wrap gap-4">
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>Query History</h1>
          <p style={{ color: '#71717a', marginTop: '0.25rem' }}>All executed queries and their results</p>
        </div>
        <Link to="/dashboard/query" className="btn-primary" id="btn-new-query" style={{ padding: '8px 20px', fontSize: '0.75rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Query
        </Link>
      </div>

      {/* Table */}
      <div className="glass-card-static animate-slide-up" style={{ overflow: 'hidden' }}>
        {queries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div
              className="flex items-center justify-center"
              style={{ width: 80, height: 80, borderRadius: 9999, background: 'rgba(30,45,64,0.5)', margin: '0 auto 1.5rem' }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <p style={{ color: '#94A3B8', fontSize: '1.125rem', fontWeight: 600 }}>No queries found</p>
            <p style={{ color: '#64748B', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              <Link to="/dashboard/query" style={{ color: '#bef264', textDecoration: 'none' }}>
                Run your first query →
              </Link>
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} className="responsive-table">
              <thead>
                <tr style={{ background: 'rgba(15,22,35,0.5)' }}>
                  <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Query ID</th>
                  <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Submitted By</th>
                  <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Timestamp</th>
                  <th style={{ textAlign: 'right', padding: '1rem 1.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {queries.map((q, i) => (
                  <tr
                    key={q.query_id}
                    className="animate-fade-in"
                    style={{
                      borderTop: '1px solid rgba(30,45,64,0.5)',
                      transition: 'background 0.2s',
                      animationDelay: `${i * 0.05}s`,
                    }}
                  >
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span style={{
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                        color: '#94A3B8',
                        background: 'rgba(30,45,64,0.5)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: 6,
                      }}>
                        {q.query_id.slice(0, 8)}…
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span className={`badge badge-${q.status}`}>
                        ● {q.status}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#94A3B8' }}>{q.submitted_by}</td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#64748B' }}>
                      {new Date(q.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                      <Link
                        to={`/dashboard/results/${q.query_id}`}
                        className="flex items-center gap-1"
                        style={{
                          display: 'inline-flex',
                          fontSize: '0.8rem',
                          color: '#bef264',
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        View
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition: 'transform 0.2s' }}>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {queries.length > 0 && (
        <div className="flex gap-6 justify-center flex-wrap animate-fade-in" style={{ fontSize: '0.875rem', color: '#64748B' }}>
          <span>
            Total: <strong style={{ color: '#94A3B8' }}>{queries.length}</strong>
          </span>
          <span>
            Completed: <strong style={{ color: '#4edea3' }}>{queries.filter((q) => q.status === 'done').length}</strong>
          </span>
          <span>
            Failed: <strong style={{ color: '#ffb4ab' }}>{queries.filter((q) => q.status === 'failed').length}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

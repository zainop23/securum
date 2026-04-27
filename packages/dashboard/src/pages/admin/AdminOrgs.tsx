import { useState, useEffect } from 'react';
import client from '../../api/client';

interface OrgRow {
  id: string;
  name: string;
  status: string;
  onboarding_step: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  query_count: number;
}

export default function AdminOrgs() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchOrgs = async () => {
    try {
      const { data } = await client.get('/admin/orgs');
      setOrgs(data.orgs || []);
    } catch (err) {
      console.error('Failed to fetch orgs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handleStatusChange = async (orgId: string, newStatus: string) => {
    setError('');
    setSuccess('');
    try {
      await client.put(`/admin/orgs/${orgId}/status`, { status: newStatus });
      setSuccess(`Organization status updated to ${newStatus}`);
      fetchOrgs();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update status';
      setError(msg);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 32, width: 280 }} />
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div className="animate-fade-in">
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: '#bef264', verticalAlign: 'middle', marginRight: '0.5rem' }}>apartment</span>
          All Organizations
        </h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem', fontSize: '0.9rem' }}>{orgs.length} organizations registered</p>
      </div>

      {/* Alerts */}
      {error && <div className="animate-fade-in" style={{ padding: '0.75rem 1rem', background: 'rgba(147,0,10,0.15)', border: '1px solid rgba(255,180,171,0.2)', color: '#ffb4ab', fontSize: '0.85rem' }}>{error}</div>}
      {success && <div className="animate-fade-in" style={{ padding: '0.75rem 1rem', background: 'rgba(78,222,163,0.08)', border: '1px solid rgba(78,222,163,0.2)', color: '#4edea3', fontSize: '0.85rem' }}>{success}</div>}

      {/* Table */}
      <div className="glass-card-static animate-slide-up" style={{ overflow: 'hidden' }}>
        {orgs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: '#52525b', display: 'block', marginBottom: '1rem' }}>apartment</span>
            <p style={{ color: '#71717a' }}>No organizations registered</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} className="responsive-table">
              <thead>
                <tr style={{ background: 'rgba(14,14,14,0.5)' }}>
                  {['Organization', 'Status', 'Members', 'Queries', 'Onboarding', 'Created', 'Actions'].map((h) => (
                    <th key={h} style={{ textAlign: h === 'Actions' ? 'right' : 'left', padding: '1rem 1.25rem', fontSize: '0.6rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgs.map((org, i) => (
                  <tr key={org.id} className="animate-fade-in" style={{ borderTop: '1px solid rgba(190,242,100,0.05)', animationDelay: `${i * 0.05}s` }}>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.9rem', color: '#e5e2e1', fontWeight: 500 }}>{org.name}</td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <span className={`badge badge-${org.status === 'active' ? 'active' : org.status === 'inactive' ? 'inactive' : 'pending'}`}>
                        {org.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.85rem', color: '#a1a1aa' }}>{org.member_count}</td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.85rem', color: '#a1a1aa' }}>{org.query_count}</td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#71717a' }}>{org.onboarding_step}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8rem', color: '#52525b' }}>
                      {new Date(org.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>
                      {org.status === 'active' ? (
                        <button onClick={() => handleStatusChange(org.id, 'inactive')} className="btn-danger" style={{ padding: '4px 12px', fontSize: '0.65rem' }}>
                          Suspend
                        </button>
                      ) : (
                        <button onClick={() => handleStatusChange(org.id, 'active')} className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.65rem' }}>
                          Activate
                        </button>
                      )}
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

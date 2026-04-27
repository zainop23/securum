import { useState, useEffect } from 'react';
import client from '../../api/client';

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  org_id: string | null;
  org_name: string | null;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchUsers = async () => {
    try {
      const { data } = await client.get('/admin/users');
      setUsers(data.users || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleStatus = async (userId: string, currentlyActive: boolean) => {
    setError('');
    setSuccess('');
    try {
      await client.put(`/admin/users/${userId}/status`, { isActive: !currentlyActive });
      setSuccess(`User ${currentlyActive ? 'deactivated' : 'activated'}`);
      fetchUsers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update user status';
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
          <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: '#bef264', verticalAlign: 'middle', marginRight: '0.5rem' }}>group</span>
          All Users
        </h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem', fontSize: '0.9rem' }}>{users.length} users across all organizations</p>
      </div>

      {/* Alerts */}
      {error && <div className="animate-fade-in" style={{ padding: '0.75rem 1rem', background: 'rgba(147,0,10,0.15)', border: '1px solid rgba(255,180,171,0.2)', color: '#ffb4ab', fontSize: '0.85rem' }}>{error}</div>}
      {success && <div className="animate-fade-in" style={{ padding: '0.75rem 1rem', background: 'rgba(78,222,163,0.08)', border: '1px solid rgba(78,222,163,0.2)', color: '#4edea3', fontSize: '0.85rem' }}>{success}</div>}

      {/* Table */}
      <div className="glass-card-static animate-slide-up" style={{ overflow: 'hidden' }}>
        {users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: '#52525b', display: 'block', marginBottom: '1rem' }}>person_off</span>
            <p style={{ color: '#71717a' }}>No users found</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} className="responsive-table">
              <thead>
                <tr style={{ background: 'rgba(14,14,14,0.5)' }}>
                  {['Name', 'Email', 'Role', 'Organization', 'Status', 'Last Login', 'Actions'].map((h) => (
                    <th key={h} style={{ textAlign: h === 'Actions' ? 'right' : 'left', padding: '1rem 1.25rem', fontSize: '0.6rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className="animate-fade-in" style={{ borderTop: '1px solid rgba(190,242,100,0.05)', animationDelay: `${i * 0.04}s` }}>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.85rem', color: '#e5e2e1', fontWeight: 500 }}>{u.full_name}</td>
                    <td style={{ padding: '0.875rem 1.25rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#a1a1aa' }}>{u.email}</td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <span className="badge badge-role">{u.role.replace('_', ' ')}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.85rem', color: '#a1a1aa' }}>
                      {u.org_name || <span style={{ color: '#52525b' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <span className={`badge badge-${u.is_active ? 'active' : 'inactive'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8rem', color: '#52525b' }}>
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleToggleStatus(u.id, u.is_active)}
                        className={u.is_active ? 'btn-danger' : 'btn-primary'}
                        style={{ padding: '4px 12px', fontSize: '0.65rem' }}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
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

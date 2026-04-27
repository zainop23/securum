import { useState, useEffect } from 'react';
import client from '../api/client';

interface Member {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('analyst');
  const [inviting, setInviting] = useState(false);
  const [inviteToken, setInviteToken] = useState('');

  const fetchMembers = async () => {
    try {
      const { data } = await client.get('/orgs/me/members');
      setMembers(data.members || []);
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleInvite = async () => {
    setError('');
    setSuccess('');
    setInviteToken('');
    setInviting(true);
    try {
      const { data } = await client.post('/orgs/me/invite', {
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteToken(data.token);
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to send invitation';
      setError(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;
    setError('');
    setSuccess('');
    try {
      await client.delete(`/orgs/me/members/${userId}`);
      setSuccess('Member removed');
      fetchMembers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to remove member';
      setError(msg);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    setError('');
    setSuccess('');
    try {
      await client.put(`/orgs/me/members/${userId}/role`, { role: newRole });
      setSuccess('Role updated');
      fetchMembers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to change role';
      setError(msg);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 32, width: 200 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in flex-wrap gap-4">
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>Team Management</h1>
          <p style={{ color: '#71717a', marginTop: '0.25rem', fontSize: '0.9rem' }}>Manage your organization's team members</p>
        </div>
        <button onClick={() => setShowInvite(!showInvite)} className="btn-primary" style={{ padding: '8px 20px', fontSize: '0.75rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
          Invite Member
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="animate-fade-in" style={{ padding: '0.75rem 1rem', background: 'rgba(147,0,10,0.15)', border: '1px solid rgba(255,180,171,0.2)', color: '#ffb4ab', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="animate-fade-in" style={{ padding: '0.75rem 1rem', background: 'rgba(78,222,163,0.08)', border: '1px solid rgba(78,222,163,0.2)', color: '#4edea3', fontSize: '0.85rem' }}>
          {success}
        </div>
      )}

      {/* Invite Form */}
      {showInvite && (
        <div className="glass-card-static animate-fade-in" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", marginBottom: '1rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: '#bef264', verticalAlign: 'middle', marginRight: '0.5rem' }}>mail</span>
            Send Invitation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>Email</label>
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="input-field" placeholder="user@example.com" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>Role</label>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="input-field">
                <option value="analyst">Analyst</option>
                <option value="org_admin">Org Admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={handleInvite} disabled={inviting || !inviteEmail} className="btn-primary" style={{ padding: '10px 20px', fontSize: '0.75rem' }}>
                {inviting ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </div>
          {inviteToken && (
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(190,242,100,0.06)', border: '1px solid rgba(190,242,100,0.1)' }}>
              <p style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '0.25rem' }}>Invitation link (share with the invitee):</p>
              <code style={{ fontSize: '0.75rem', color: '#bef264', wordBreak: 'break-all' }}>
                {window.location.origin}/invite/{inviteToken}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Members Table */}
      <div className="glass-card-static animate-slide-up" style={{ overflow: 'hidden' }}>
        {members.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: '#52525b', display: 'block', marginBottom: '1rem' }}>group</span>
            <p style={{ color: '#71717a', fontSize: '1rem', fontWeight: 600 }}>No team members yet</p>
            <p style={{ color: '#52525b', fontSize: '0.85rem', marginTop: '0.25rem' }}>Invite your first team member to get started</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} className="responsive-table">
              <thead>
                <tr style={{ background: 'rgba(14,14,14,0.5)' }}>
                  {['Name', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map((h) => (
                    <th key={h} style={{ textAlign: h === 'Actions' ? 'right' : 'left', padding: '1rem 1.25rem', fontSize: '0.6rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.id} className="animate-fade-in" style={{ borderTop: '1px solid rgba(190,242,100,0.05)', animationDelay: `${i * 0.05}s` }}>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.85rem', color: '#e5e2e1', fontWeight: 500 }}>{m.full_name}</td>
                    <td style={{ padding: '0.875rem 1.25rem', color: '#a1a1aa', fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.email}</td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <select
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.id, e.target.value)}
                        style={{ background: 'transparent', border: 'none', color: '#bef264', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        <option value="analyst" style={{ background: '#1c1b1b', color: '#e5e2e1' }}>Analyst</option>
                        <option value="org_admin" style={{ background: '#1c1b1b', color: '#e5e2e1' }}>Org Admin</option>
                      </select>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <span className={`badge badge-${m.is_active ? 'active' : 'inactive'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', fontSize: '0.8rem', color: '#52525b' }}>
                      {m.last_login_at ? new Date(m.last_login_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        className="btn-danger"
                        style={{ padding: '4px 12px', fontSize: '0.65rem' }}
                      >
                        Remove
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

import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

export default function InvitePage() {
  const { token: inviteToken } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ email: string; orgName: string; role: string } | null>(null);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    // We don't have a GET endpoint for invitation details, so we'll just show the form
    // The backend validates the token on submit
    if (!inviteToken) {
      setInviteError('No invitation token provided');
    }
  }, [inviteToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const { data } = await client.post('/auth/accept-invite', {
        token: inviteToken,
        fullName,
        password,
      });
      login(data.token, data.user);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to accept invitation. The link may be expired or already used.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (inviteError) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '100vh', background: '#131313' }}>
        <div className="glass-card animate-fade-in" style={{ padding: '2.5rem', maxWidth: '28rem', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: '#ffb4ab', marginBottom: '1rem', display: 'block' }}>error</span>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.25rem', fontWeight: 600, color: '#e5e2e1', marginBottom: '0.5rem' }}>Invalid Invitation</h1>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginBottom: '1.5rem' }}>{inviteError}</p>
          <Link to="/login" className="btn-primary">Go to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center relative overflow-hidden" style={{ minHeight: '100vh', padding: '1rem', background: '#131313' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="grid-overlay" />
      </div>

      <div className="glass-card animate-fade-in relative" style={{ padding: '2.5rem', width: '100%', maxWidth: '28rem' }}>
        <div className="flex flex-col items-center" style={{ marginBottom: '2rem' }}>
          <div className="flex items-center justify-center" style={{ width: 56, height: 56, background: 'rgba(78,222,163,0.15)', border: '1px solid rgba(78,222,163,0.2)', marginBottom: '1rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '28px', color: '#4edea3' }}>group_add</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif" }}>Accept Invitation</h1>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '0.25rem' }}>Set up your account to join the team</p>
          {inviteInfo && (
            <div style={{ marginTop: '0.75rem', padding: '0.5rem 1rem', background: 'rgba(190,242,100,0.06)', border: '1px solid rgba(190,242,100,0.1)' }}>
              <p style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Joining <strong style={{ color: '#bef264' }}>{inviteInfo.orgName}</strong> as <strong style={{ color: '#bef264' }}>{inviteInfo.role}</strong></p>
            </div>
          )}
        </div>

        {error && (
          <div className="animate-fade-in" style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(147,0,10,0.15)', border: '1px solid rgba(255,180,171,0.2)', color: '#ffb4ab', fontSize: '0.85rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label htmlFor="invite-fullname" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
              Full Name
            </label>
            <input
              id="invite-fullname"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-field"
              placeholder="Bob Johnson"
              required
            />
          </div>

          <div>
            <label htmlFor="invite-password" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
              Password
            </label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Min 8 characters"
              required
              autoComplete="new-password"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', padding: '0.875rem 1.5rem', fontSize: '0.85rem' }}>
            {loading ? (
              <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Joining...</>
            ) : (
              'Accept & Join'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

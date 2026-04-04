import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const usernameRef = useRef<HTMLInputElement>(null);

  // Reliable autofocus
  useEffect(() => {
    const timer = setTimeout(() => {
      usernameRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await client.post('/auth/login', { username, password });
      login(data.token);
      navigate('/');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Login failed. Check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center relative overflow-hidden" style={{ minHeight: '100vh', padding: '1rem', background: '#080B14' }}>
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute rounded-full"
          style={{
            top: '-10rem', right: '-10rem',
            width: '28rem', height: '28rem',
            background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: '-10rem', left: '-10rem',
            width: '28rem', height: '28rem',
            background: 'radial-gradient(circle, rgba(20,184,166,0.1) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '40rem', height: '40rem',
            background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      <div className="glass-card animate-fade-in relative" style={{ padding: '2.5rem', width: '100%', maxWidth: '28rem' }}>
        {/* Logo */}
        <div className="flex flex-col items-center" style={{ marginBottom: '2rem' }}>
          <div
            className="flex items-center justify-center animate-pulse-glow"
            style={{
              width: 64, height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #6366F1, #14B8A6)',
              marginBottom: '1rem',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.02em' }}>Welcome Back</h1>
          <p style={{ color: '#94A3B8', fontSize: '0.875rem', marginTop: '0.25rem' }}>Sign in to the Securum dashboard</p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="animate-fade-in"
            id="login-error"
            style={{
              marginBottom: '1.5rem',
              padding: '0.75rem 1rem',
              borderRadius: 12,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#F87171',
              fontSize: '0.875rem',
              textAlign: 'center' as const,
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' }}>
          <div>
            <label htmlFor="login-username" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#94A3B8', marginBottom: '0.5rem' }}>
              Username
            </label>
            <input
              ref={usernameRef}
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              placeholder="Enter username"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="login-password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#94A3B8', marginBottom: '0.5rem' }}>
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Enter password"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            id="btn-login"
            className="btn-primary"
            style={{ width: '100%', padding: '0.75rem 1.5rem', fontSize: '0.95rem' }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Footer */}
        <p style={{ textAlign: 'center' as const, color: '#64748B', fontSize: '0.75rem', marginTop: '1.5rem' }}>
          Secure Multi-Organization Analytics Platform
        </p>
      </div>
    </div>
  );
}

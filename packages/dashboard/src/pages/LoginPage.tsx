import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);

  // Reliable autofocus
  useEffect(() => {
    const timer = setTimeout(() => {
      emailRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await client.post('/auth/login', { email, password });
      login(data.token, data.user);

      // Redirect based on role and onboarding status
      if (data.user.role === 'platform_admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
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
    <div className="flex items-center justify-center relative overflow-hidden" style={{ minHeight: '100vh', padding: '1rem', background: '#131313' }}>
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="grid-overlay" />
        <div
          className="absolute rounded-full"
          style={{
            top: '-10rem', right: '-10rem',
            width: '28rem', height: '28rem',
            background: 'radial-gradient(circle, rgba(190,242,100,0.08) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: '-10rem', left: '-10rem',
            width: '28rem', height: '28rem',
            background: 'radial-gradient(circle, rgba(78,222,163,0.05) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      <div className="glass-card animate-fade-in relative" style={{ padding: '2.5rem', width: '100%', maxWidth: '28rem' }}>
        {/* Logo */}
        <div className="flex flex-col items-center" style={{ marginBottom: '2rem' }}>
          <div
            className="flex items-center justify-center animate-pulse-glow"
            style={{
              width: 56, height: 56,
              background: '#bef264',
              marginBottom: '1rem',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '28px', color: '#131f00' }}>shield_lock</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>Welcome Back</h1>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '0.25rem' }}>Sign in to the Securum platform</p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="animate-fade-in"
            id="login-error"
            style={{
              marginBottom: '1.5rem',
              padding: '0.75rem 1rem',
              background: 'rgba(147,0,10,0.15)',
              border: '1px solid rgba(255,180,171,0.2)',
              color: '#ffb4ab',
              fontSize: '0.85rem',
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label htmlFor="login-email" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
              Email
            </label>
            <input
              ref={emailRef}
              id="login-email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="operator@securum.dev"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="login-password" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
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
            style={{ width: '100%', padding: '0.875rem 1.5rem', fontSize: '0.85rem' }}
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
        <p style={{ textAlign: 'center', color: '#52525b', fontSize: '0.8rem', marginTop: '1.5rem' }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: '#bef264', textDecoration: 'none', fontWeight: 600 }}>Create Organization</Link>
        </p>
      </div>
    </div>
  );
}

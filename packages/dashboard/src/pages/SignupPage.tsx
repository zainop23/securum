import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

export default function SignupPage() {
  const [orgName, setOrgName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const orgNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => orgNameRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter';
    if (!/[0-9]/.test(pw)) return 'Password must contain at least one number';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }

    setLoading(true);

    try {
      const { data } = await client.post('/auth/register', {
        email,
        password,
        fullName,
        orgName,
      });
      login(data.token, data.user);
      navigate('/onboarding');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Registration failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center relative overflow-hidden" style={{ minHeight: '100vh', padding: '1rem', background: '#131313' }}>
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="grid-overlay" />
        <div className="absolute rounded-full" style={{ top: '-10rem', right: '-10rem', width: '28rem', height: '28rem', background: 'radial-gradient(circle, rgba(190,242,100,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute rounded-full" style={{ bottom: '-10rem', left: '-10rem', width: '28rem', height: '28rem', background: 'radial-gradient(circle, rgba(78,222,163,0.05) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div className="glass-card animate-fade-in relative" style={{ padding: '2.5rem', width: '100%', maxWidth: '32rem' }}>
        {/* Logo */}
        <div className="flex flex-col items-center" style={{ marginBottom: '2rem' }}>
          <div className="flex items-center justify-center animate-pulse-glow" style={{ width: 56, height: 56, background: '#bef264', marginBottom: '1rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '28px', color: '#131f00' }}>shield_lock</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>Create Organization</h1>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '0.25rem' }}>Register your organization on Securum</p>
        </div>

        {/* Error */}
        {error && (
          <div className="animate-fade-in" id="signup-error" style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(147,0,10,0.15)', border: '1px solid rgba(255,180,171,0.2)', color: '#ffb4ab', fontSize: '0.85rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label htmlFor="signup-orgname" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
              Organization Name
            </label>
            <input
              ref={orgNameRef}
              id="signup-orgname"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="input-field"
              placeholder="Hospital Alpha Network"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-fullname" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
              Admin Full Name
            </label>
            <input
              id="signup-fullname"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-field"
              placeholder="Alice Smith"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-email" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="admin@hospital.org"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="signup-password" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Min 8 chars, 1 uppercase, 1 number"
              required
              autoComplete="new-password"
            />
          </div>

          <div>
            <label htmlFor="signup-confirm" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
              Confirm Password
            </label>
            <input
              id="signup-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
              placeholder="Re-enter password"
              required
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            id="btn-signup"
            className="btn-primary"
            style={{ width: '100%', padding: '0.875rem 1.5rem', fontSize: '0.85rem', marginTop: '0.5rem' }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Creating...
              </>
            ) : (
              'Create Organization'
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: '#52525b', fontSize: '0.8rem', marginTop: '1.5rem' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#bef264', textDecoration: 'none', fontWeight: 600 }}>Sign In</Link>
        </p>
      </div>
    </div>
  );
}

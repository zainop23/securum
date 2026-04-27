import { useState, useEffect, type FormEvent } from 'react';
import client from '../api/client';

interface OrgSettings {
  id: string;
  name: string;
  description: string | null;
  endpoint_url: string;
  schema_map: Record<string, unknown> | null;
  privacy_budget_limit: string;
  max_epsilon_per_query: string;
  onboarding_step: string;
  status: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacyBudgetLimit, setPrivacyBudgetLimit] = useState('10');
  const [maxEpsilonPerQuery, setMaxEpsilonPerQuery] = useState('5');

  // Connectivity test
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<{ success?: boolean; latencyMs?: number; error?: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await client.get('/orgs/me/settings');
        const s = data.settings;
        setSettings(s);
        setName(s.name || '');
        setDescription(s.description || '');
        setPrivacyBudgetLimit(String(s.privacy_budget_limit || '10'));
        setMaxEpsilonPerQuery(String(s.max_epsilon_per_query || '5'));
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await client.put('/orgs/me', { name, description });
      setSuccess('Organization profile updated');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update profile';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrivacy = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await client.put('/orgs/me/settings', {
        privacyBudgetLimit: parseFloat(privacyBudgetLimit),
        maxEpsilonPerQuery: parseFloat(maxEpsilonPerQuery),
      });
      setSuccess('Privacy settings updated');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update settings';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnectivity = async () => {
    setTestingConn(true);
    setConnResult(null);
    try {
      const { data } = await client.post('/onboarding/test-connectivity');
      setConnResult(data);
    } catch {
      setConnResult({ success: false, error: 'Request failed' });
    } finally {
      setTestingConn(false);
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
      <div className="animate-fade-in">
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>Organization Settings</h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem', fontSize: '0.9rem' }}>Manage your organization's profile and configuration</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Section */}
        <div className="glass-card-static animate-slide-up" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", marginBottom: '1.25rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#bef264', verticalAlign: 'middle', marginRight: '0.5rem' }}>business</span>
            Organization Profile
          </h2>
          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>Organization Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" rows={3} style={{ resize: 'vertical' }} placeholder="Optional description..." />
            </div>
            <button type="submit" disabled={saving} className="btn-primary" style={{ alignSelf: 'flex-start', padding: '8px 20px', fontSize: '0.75rem' }}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* Privacy Settings */}
        <div className="glass-card-static animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.1s' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", marginBottom: '1.25rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#bef264', verticalAlign: 'middle', marginRight: '0.5rem' }}>privacy_tip</span>
            Privacy Configuration
          </h2>
          <form onSubmit={handleSavePrivacy} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>Total Privacy Budget (ε)</label>
              <input type="number" step="0.1" min="0.1" value={privacyBudgetLimit} onChange={(e) => setPrivacyBudgetLimit(e.target.value)} className="input-field" />
              <p style={{ fontSize: '0.7rem', color: '#52525b', marginTop: '0.25rem' }}>Maximum cumulative epsilon across all queries</p>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>Max ε Per Query</label>
              <input type="number" step="0.1" min="0.1" value={maxEpsilonPerQuery} onChange={(e) => setMaxEpsilonPerQuery(e.target.value)} className="input-field" />
              <p style={{ fontSize: '0.7rem', color: '#52525b', marginTop: '0.25rem' }}>Maximum epsilon allowed for a single query</p>
            </div>
            <button type="submit" disabled={saving} className="btn-primary" style={{ alignSelf: 'flex-start', padding: '8px 20px', fontSize: '0.75rem' }}>
              {saving ? 'Saving...' : 'Save Privacy Settings'}
            </button>
          </form>
        </div>
      </div>

      {/* Node & Connectivity */}
      <div className="glass-card-static animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.2s' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", marginBottom: '1.25rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#bef264', verticalAlign: 'middle', marginRight: '0.5rem' }}>dns</span>
          Node Configuration
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>Endpoint URL</label>
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(14,14,14,0.5)', border: '1px solid rgba(190,242,100,0.08)', fontFamily: 'monospace', fontSize: '0.85rem', color: '#a1a1aa' }}>
              {settings?.endpoint_url || 'Not configured'}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>Status</label>
            <div className="flex items-center gap-3">
              <span className={`badge badge-${settings?.status === 'active' ? 'active' : 'pending'}`}>
                {settings?.status || 'unknown'}
              </span>
              <button onClick={handleTestConnectivity} disabled={testingConn} className="btn-secondary" style={{ padding: '6px 16px', fontSize: '0.7rem' }}>
                {testingConn ? 'Testing...' : 'Re-test Connection'}
              </button>
            </div>
            {connResult && (
              <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: connResult.success ? '#4edea3' : '#ffb4ab' }}>
                {connResult.success ? `Connected (${connResult.latencyMs}ms)` : `Failed: ${connResult.error}`}
              </p>
            )}
          </div>
        </div>

        {/* Schema Map Viewer */}
        {settings?.schema_map && (
          <div style={{ marginTop: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>Schema Map</label>
            <pre style={{ padding: '1rem', background: 'rgba(14,14,14,0.5)', border: '1px solid rgba(190,242,100,0.06)', fontFamily: 'monospace', fontSize: '0.75rem', color: '#a1a1aa', overflow: 'auto', maxHeight: '200px' }}>
              {JSON.stringify(settings.schema_map, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

type OnboardingStep = 'account_created' | 'node_endpoint_configured' | 'schema_map_uploaded' | 'connectivity_verified' | 'onboarding_complete';

const STEPS: { key: OnboardingStep; label: string; icon: string }[] = [
  { key: 'account_created', label: 'Configure Node Endpoint', icon: 'dns' },
  { key: 'node_endpoint_configured', label: 'Upload Schema Map', icon: 'schema' },
  { key: 'schema_map_uploaded', label: 'Test Connectivity', icon: 'wifi_tethering' },
  { key: 'connectivity_verified', label: 'Complete Setup', icon: 'celebration' },
];

const stepIndex = (step: OnboardingStep): number => {
  const map: Record<OnboardingStep, number> = {
    account_created: 0,
    node_endpoint_configured: 1,
    schema_map_uploaded: 2,
    connectivity_verified: 3,
    onboarding_complete: 4,
  };
  return map[step] ?? 0;
};

const EXAMPLE_SCHEMA_MAP = JSON.stringify({
  tables: { transactions: 'sales' },
  columns: {
    amount: 'total_amount',
    category: 'product_type',
    region: 'region',
    tx_date: 'sale_date',
  },
}, null, 2);

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('account_created');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1 state
  const [endpointUrl, setEndpointUrl] = useState('');

  // Step 2 state
  const [schemaMapJson, setSchemaMapJson] = useState(EXAMPLE_SCHEMA_MAP);

  // Step 3 state
  const [connectivityResult, setConnectivityResult] = useState<{ success?: boolean; latencyMs?: number; error?: string } | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data } = await client.get('/onboarding/status');
        if (data.isComplete) {
          navigate('/dashboard');
          return;
        }
        setCurrentStep(data.currentStep);
      } catch (err) {
        console.error('Failed to fetch onboarding status:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, [navigate]);

  const activeIdx = stepIndex(currentStep);

  const handleConfigureEndpoint = async () => {
    setError('');
    setSubmitting(true);
    try {
      await client.put('/onboarding/node-endpoint', { endpointUrl });
      setCurrentStep('node_endpoint_configured');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to configure endpoint';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadSchema = async () => {
    setError('');
    setSubmitting(true);
    try {
      const schemaMap = JSON.parse(schemaMapJson);
      await client.put('/onboarding/schema-map', { schemaMap });
      setCurrentStep('schema_map_uploaded');
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON format. Please check your schema map.');
      } else {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to upload schema map';
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestConnectivity = async () => {
    setError('');
    setSubmitting(true);
    setConnectivityResult(null);
    try {
      const { data } = await client.post('/onboarding/test-connectivity');
      setConnectivityResult(data);
      if (data.success) {
        setCurrentStep('connectivity_verified');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Connectivity test failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async () => {
    setError('');
    setSubmitting(true);
    try {
      await client.post('/onboarding/complete');
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to complete onboarding';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '100vh', background: '#131313' }}>
        <div className="spinner spinner-large" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center relative overflow-hidden" style={{ minHeight: '100vh', padding: '1.5rem', background: '#131313' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="grid-overlay" />
      </div>

      <div className="relative" style={{ width: '100%', maxWidth: '48rem' }}>
        {/* Header */}
        <div className="text-center animate-fade-in" style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '2rem', fontWeight: 700, color: '#e5e2e1', letterSpacing: '-0.02em' }}>
            Organization <span style={{ color: '#bef264' }}>Onboarding</span>
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.9rem', marginTop: '0.5rem' }}>Complete these steps to activate your organization</p>
        </div>

        {/* Progress Bar */}
        <div className="animate-fade-in" style={{ marginBottom: '2rem' }}>
          <div style={{ height: 3, background: 'rgba(190,242,100,0.1)', position: 'relative' }}>
            <div style={{ height: '100%', background: '#bef264', width: `${(activeIdx / 4) * 100}%`, transition: 'width 0.5s ease' }} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Step Sidebar */}
          <div className="md:col-span-1 animate-slide-up">
            <div className="glass-card-static" style={{ padding: '1rem' }}>
              {STEPS.map((step, i) => {
                const isCompleted = i < activeIdx;
                const isCurrent = i === activeIdx;
                return (
                  <div
                    key={step.key}
                    className={`stepper-step ${isCompleted ? 'completed' : isCurrent ? 'current' : 'upcoming'}`}
                    style={{ cursor: isCompleted ? 'pointer' : 'default' }}
                    onClick={() => { if (isCompleted) setCurrentStep(STEPS[i].key); }}
                  >
                    <div className="flex items-center justify-center" style={{
                      width: 28, height: 28, flexShrink: 0,
                      background: isCompleted ? 'rgba(78,222,163,0.15)' : isCurrent ? 'rgba(190,242,100,0.15)' : 'rgba(42,42,42,0.5)',
                    }}>
                      {isCompleted ? (
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#4edea3' }}>check</span>
                      ) : (
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: isCurrent ? '#bef264' : '#52525b' }}>{step.icon}</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: isCompleted ? '#4edea3' : isCurrent ? '#bef264' : '#52525b', fontFamily: "'Space Grotesk', sans-serif" }}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="md:col-span-3 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="glass-card-static" style={{ padding: '2rem' }}>
              {/* Error */}
              {error && (
                <div className="animate-fade-in" style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(147,0,10,0.15)', border: '1px solid rgba(255,180,171,0.2)', color: '#ffb4ab', fontSize: '0.85rem' }}>
                  {error}
                </div>
              )}

              {/* Step 1: Configure Node Endpoint */}
              {activeIdx === 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: '#bef264' }}>dns</span>
                    <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.25rem', fontWeight: 600, color: '#e5e2e1' }}>Configure Node Endpoint</h2>
                  </div>
                  <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                    Enter the URL where your org-node is running. This is the endpoint the coordinator will use to communicate with your node during the commit-reveal protocol.
                  </p>
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(14,14,14,0.5)', border: '1px solid rgba(190,242,100,0.06)' }}>
                    <p style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#bef264', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Example Docker Run</p>
                    <code style={{ fontSize: '0.75rem', color: '#a1a1aa', wordBreak: 'break-all' }}>
                      docker run -p 5001:5001 -e DATABASE_URL=... securum/org-node
                    </code>
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label htmlFor="onb-endpoint" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
                      Endpoint URL
                    </label>
                    <input
                      id="onb-endpoint"
                      type="url"
                      value={endpointUrl}
                      onChange={(e) => setEndpointUrl(e.target.value)}
                      className="input-field"
                      placeholder="http://org-node-1:5001"
                      required
                    />
                  </div>
                  <button onClick={handleConfigureEndpoint} disabled={submitting || !endpointUrl} className="btn-primary" style={{ padding: '10px 24px' }}>
                    {submitting ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Saving...</> : 'Save Endpoint'}
                  </button>
                </div>
              )}

              {/* Step 2: Upload Schema Map */}
              {activeIdx === 1 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: '#bef264' }}>schema</span>
                    <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.25rem', fontWeight: 600, color: '#e5e2e1' }}>Upload Schema Map</h2>
                  </div>
                  <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                    Define how your local database schema maps to the global schema. This tells the coordinator how to translate queries for your specific database structure.
                  </p>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label htmlFor="onb-schema" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#71717a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
                      Schema Map JSON
                    </label>
                    <textarea
                      id="onb-schema"
                      value={schemaMapJson}
                      onChange={(e) => setSchemaMapJson(e.target.value)}
                      className="input-field"
                      rows={10}
                      style={{ fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
                    />
                  </div>
                  <button onClick={handleUploadSchema} disabled={submitting} className="btn-primary" style={{ padding: '10px 24px' }}>
                    {submitting ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Uploading...</> : 'Upload Schema Map'}
                  </button>
                </div>
              )}

              {/* Step 3: Test Connectivity */}
              {activeIdx === 2 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: '#bef264' }}>wifi_tethering</span>
                    <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.25rem', fontWeight: 600, color: '#e5e2e1' }}>Test Connectivity</h2>
                  </div>
                  <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                    Verify that the coordinator can reach your org-node's health endpoint. Make sure your org-node container is running before testing.
                  </p>

                  {connectivityResult && (
                    <div className="animate-fade-in" style={{
                      marginBottom: '1.5rem', padding: '1.25rem',
                      background: connectivityResult.success ? 'rgba(78,222,163,0.08)' : 'rgba(147,0,10,0.1)',
                      border: `1px solid ${connectivityResult.success ? 'rgba(78,222,163,0.2)' : 'rgba(255,180,171,0.2)'}`,
                    }}>
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined" style={{ fontSize: '2rem', color: connectivityResult.success ? '#4edea3' : '#ffb4ab' }}>
                          {connectivityResult.success ? 'check_circle' : 'error'}
                        </span>
                        <div>
                          <p style={{ fontWeight: 600, color: connectivityResult.success ? '#4edea3' : '#ffb4ab', fontFamily: "'Space Grotesk', sans-serif" }}>
                            {connectivityResult.success ? 'Connection Successful!' : 'Connection Failed'}
                          </p>
                          {connectivityResult.latencyMs !== undefined && (
                            <p style={{ fontSize: '0.8rem', color: '#71717a', marginTop: '0.25rem' }}>Latency: {connectivityResult.latencyMs}ms</p>
                          )}
                          {connectivityResult.error && (
                            <p style={{ fontSize: '0.8rem', color: '#ffb4ab', marginTop: '0.25rem' }}>{connectivityResult.error}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <button onClick={handleTestConnectivity} disabled={submitting} className="btn-primary" style={{ padding: '10px 24px' }}>
                    {submitting ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Testing...</> : (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cable</span>
                        Test Connection
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Step 4: Complete */}
              {activeIdx === 3 && (
                <div className="text-center" style={{ padding: '2rem 0' }}>
                  <div className="flex items-center justify-center" style={{ width: 80, height: 80, background: 'rgba(78,222,163,0.1)', border: '1px solid rgba(78,222,163,0.2)', margin: '0 auto 1.5rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: '#4edea3' }}>celebration</span>
                  </div>
                  <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#e5e2e1', marginBottom: '0.75rem' }}>All Set!</h2>
                  <p style={{ color: '#a1a1aa', fontSize: '0.9rem', marginBottom: '2rem', maxWidth: '24rem', margin: '0 auto 2rem' }}>
                    Your organization is configured and your node is connected. Complete the setup to start running privacy-preserving analytics.
                  </p>
                  <button onClick={handleComplete} disabled={submitting} className="btn-primary" style={{ padding: '14px 32px' }}>
                    {submitting ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Completing...</> : (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>rocket_launch</span>
                        Complete Setup & Go to Dashboard
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

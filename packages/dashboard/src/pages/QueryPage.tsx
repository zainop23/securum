import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

const AGGREGATES = ['COUNT', 'SUM', 'AVG'] as const;
const COLUMNS = ['amount', 'category', 'region', 'tx_date'];
const GROUP_COLUMNS = ['', 'category', 'region', 'tx_date'];

export default function QueryPage() {
  const navigate = useNavigate();
  const [aggregate, setAggregate] = useState<string>('COUNT');
  const [column, setColumn] = useState<string>('amount');
  const [groupBy, setGroupBy] = useState<string>('');
  const [epsilon, setEpsilon] = useState<number>(1.0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        aggregate,
        column,
        epsilon,
        submitter: 'analyst',
      };
      if (groupBy) {
        payload.grouping = groupBy;
      }

      const { data } = await client.post('/query', payload);

      if (data.queryId) {
        navigate(`/results/${data.queryId}`);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Query execution failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const getPrivacyLabel = () => {
    if (epsilon <= 0.5) return { text: 'Very High Privacy', color: '#14B8A6' };
    if (epsilon <= 1.0) return { text: 'High Privacy', color: '#14B8A6' };
    if (epsilon <= 3.0) return { text: 'Moderate Privacy', color: '#FCD34D' };
    if (epsilon <= 7.0) return { text: 'Low Privacy', color: '#FCD34D' };
    return { text: 'Minimal Privacy', color: '#F87171' };
  };

  const privacy = getPrivacyLabel();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div className="animate-fade-in">
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.02em' }}>Query Builder</h1>
        <p style={{ color: '#94A3B8', marginTop: '0.25rem' }}>Build and execute differentially-private aggregate queries</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        {/* Responsive two-column on large screens */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '2rem' }}>
          {/* Form */}
          <div>
            <form onSubmit={handleSubmit} className="glass-card-static animate-slide-up" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Error */}
              {error && (
                <div
                  className="animate-fade-in"
                  id="query-error"
                  style={{
                    padding: '1rem',
                    borderRadius: 12,
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#F87171',
                    fontSize: '0.875rem',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    {error}
                  </div>
                </div>
              )}

              {/* Aggregate */}
              <div>
                <label htmlFor="query-aggregate" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#94A3B8', marginBottom: '0.5rem' }}>
                  Aggregate Function
                </label>
                <select
                  id="query-aggregate"
                  value={aggregate}
                  onChange={(e) => setAggregate(e.target.value)}
                  className="input-field"
                >
                  {AGGREGATES.map((agg) => (
                    <option key={agg} value={agg}>
                      {agg}
                    </option>
                  ))}
                </select>
              </div>

              {/* Column */}
              <div>
                <label htmlFor="query-column" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#94A3B8', marginBottom: '0.5rem' }}>
                  Column
                </label>
                <select
                  id="query-column"
                  value={column}
                  onChange={(e) => setColumn(e.target.value)}
                  className="input-field"
                >
                  {COLUMNS.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              {/* Table — fixed to transactions for demo */}
              <div>
                <label htmlFor="query-table" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#94A3B8', marginBottom: '0.5rem' }}>
                  Table
                </label>
                <select id="query-table" className="input-field" disabled>
                  <option value="transactions">transactions</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>Only the transactions table is available in this demo</p>
              </div>

              {/* Group By */}
              <div>
                <label htmlFor="query-groupby" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#94A3B8', marginBottom: '0.5rem' }}>
                  Group By <span style={{ color: '#64748B' }}>(optional)</span>
                </label>
                <select
                  id="query-groupby"
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  className="input-field"
                >
                  {GROUP_COLUMNS.map((col) => (
                    <option key={col} value={col}>
                      {col || '— None —'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Epsilon Slider */}
              <div>
                <label htmlFor="query-epsilon" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#94A3B8', marginBottom: '0.5rem' }}>
                  Privacy Budget (ε)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    id="query-epsilon"
                    type="range"
                    min="0.1"
                    max="10.0"
                    step="0.1"
                    value={epsilon}
                    onChange={(e) => setEpsilon(parseFloat(e.target.value))}
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 9999,
                      appearance: 'none',
                      cursor: 'pointer',
                      background: 'linear-gradient(90deg, #14B8A6, #FCD34D, #F87171)',
                      outline: 'none',
                    }}
                    className="epsilon-slider"
                  />
                  <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#F8FAFC', minWidth: '3rem', textAlign: 'right' }}>
                    {epsilon.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between" style={{ marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', color: '#14B8A6' }}>More Private</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: privacy.color }}>{privacy.text}</span>
                  <span style={{ fontSize: '0.7rem', color: '#F87171' }}>More Accurate</span>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem', fontStyle: 'italic' }}>
                  Lower ε = more privacy noise added, less accurate results
                </p>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                id="btn-submit-query"
                className="btn-primary"
                style={{ width: '100%', padding: '0.875rem 1.5rem', fontSize: '1rem' }}
              >
                {loading ? (
                  <>
                    <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                    Executing Query...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Execute Query
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Info Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Query Preview */}
            <div className="glass-card animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.2s' }}>
              <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Query Preview</h3>
              <div style={{
                padding: '1rem',
                borderRadius: 12,
                background: 'rgba(8,11,20,0.6)',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                color: '#818cf8',
                lineHeight: 1.8,
              }}>
                SELECT {groupBy ? `${groupBy}, ` : ''}
                {aggregate === 'AVG' ? `SUM(${column}), COUNT(${column})` : `${aggregate}(${column})`}
                <br />
                FROM transactions
                {groupBy && (
                  <>
                    <br />
                    GROUP BY {groupBy}
                  </>
                )}
              </div>
            </div>

            {/* How It Works */}
            <div className="glass-card animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.3s' }}>
              <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>How It Works</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { step: '1', label: 'Query is sent to the coordinator' },
                  { step: '2', label: 'Coordinator broadcasts to all org-nodes' },
                  { step: '3', label: 'Each org executes locally & adds DP noise' },
                  { step: '4', label: 'Commit-reveal protocol verifies integrity' },
                  { step: '5', label: 'Results are aggregated & returned' },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div
                      className="flex items-center justify-center"
                      style={{
                        width: 24, height: 24,
                        borderRadius: 9999,
                        background: 'rgba(99,102,241,0.15)',
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#818cf8' }}>{item.step}</span>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: '#94A3B8' }}>{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import client from '../api/client';

interface ResultData {
  queryId: string;
  status: string;
  result?: {
    type: string;
    value?: number;
    sum?: number;
    count?: number;
    groups?: Array<{
      groupKey: string;
      value?: number;
      sum?: number;
      count?: number;
    }>;
  };
  error?: string;
}

const CHART_COLORS = [
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#818cf8', // light indigo
  '#2dd4bf', // light teal
  '#a78bfa', // violet
  '#67e8f9', // cyan
  '#FCD34D', // amber
  '#F87171', // rose
];

const COMPLETED_EXECUTION_STEPS = [
  'Privacy Budget',
  'Commit Phase',
  'Reveal & Verify',
  'Aggregation',
  'Finalization',
  'Complete',
];

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const res = await client.get(`/results/${id}`);
        setData(res.data);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Failed to fetch result.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    fetchResult();
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 32, width: 200 }} />
        <div className="skeleton" style={{ height: 384, borderRadius: 16 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.02em' }}>Query Result</h1>
        <div className="glass-card-static" style={{ padding: '2rem', textAlign: 'center' }}>
          <div
            className="flex items-center justify-center"
            style={{ width: 64, height: 64, borderRadius: 9999, background: 'rgba(239,68,68,0.12)', margin: '0 auto 1rem' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p style={{ color: '#F87171', fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>Error Loading Result</p>
          <p style={{ color: '#94A3B8', fontSize: '0.875rem' }}>{error}</p>
          <Link to="/query" className="btn-primary" style={{ marginTop: '1.5rem', display: 'inline-flex' }}>
            Run Another Query
          </Link>
        </div>
      </div>
    );
  }

  // Pending state
  if (data.status === 'pending') {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.02em' }}>Query Result</h1>
        <div className="glass-card-static" style={{ padding: '3rem', textAlign: 'center' }}>
          <div className="spinner spinner-large" style={{ margin: '0 auto 1.5rem' }} />
          <p style={{ color: '#F8FAFC', fontSize: '1.125rem', fontWeight: 600 }}>Processing Query...</p>
          <p style={{ color: '#94A3B8', fontSize: '0.875rem', marginTop: '0.5rem' }}>The commit-reveal protocol is running. This may take a few seconds.</p>
        </div>
      </div>
    );
  }

  // Failed state
  if (data.status === 'failed') {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.02em' }}>Query Result</h1>
        <div className="glass-card-static" style={{ padding: '2rem' }}>
          <div className="flex items-center gap-4" style={{ marginBottom: '1.5rem' }}>
            <div
              className="flex items-center justify-center"
              style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(239,68,68,0.12)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#F87171' }}>Query Failed</h2>
              <p style={{ color: '#94A3B8', fontSize: '0.875rem' }}>{data.error || 'An unexpected error occurred.'}</p>
            </div>
          </div>
          <div style={{
            padding: '1rem',
            borderRadius: 12,
            background: 'rgba(239,68,68,0.05)',
            border: '1px solid rgba(239,68,68,0.1)',
            marginBottom: '1.5rem',
          }}>
            <p style={{ fontSize: '0.875rem', color: '#94A3B8', fontFamily: 'monospace' }}>Query ID: {data.queryId}</p>
          </div>
          <Link to="/query" className="btn-primary" id="btn-try-again">
            Run Another Query
          </Link>
        </div>
      </div>
    );
  }

  // Done state
  const result = data.result;
  const isGrouped = result?.type === 'grouped' || result?.type === 'grouped_avg';
  const isScalar = result?.type === 'scalar' || result?.type === 'avg';

  // Prepare chart data for grouped results
  let chartData: Array<{ name: string; value: number }> = [];
  if (isGrouped && result?.groups) {
    chartData = result.groups.map((g) => ({
      name: g.groupKey,
      value:
        result.type === 'grouped_avg'
          ? g.sum !== undefined && g.count !== undefined
            ? g.sum / Math.max(g.count, 1)
            : 0
          : g.value ?? 0,
    }));
  }

  // Scalar value
  let scalarValue: number | null = null;
  if (isScalar) {
    if (result?.type === 'avg' && result.sum !== undefined && result.count !== undefined) {
      scalarValue = result.sum / Math.max(result.count, 1);
    } else if (result?.value !== undefined) {
      scalarValue = result.value;
    }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.02em' }}>Query Result</h1>
          <p style={{ color: '#64748B', marginTop: '0.25rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>ID: {data.queryId.slice(0, 12)}…</p>
        </div>
        <span className="badge badge-done">
          ● Completed
        </span>
      </div>

      {/* Scalar Result */}
      {isScalar && scalarValue !== null && (
        <div className="glass-card animate-pulse-glow animate-slide-up" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Result</p>
          <p style={{
            fontSize: 'clamp(2.5rem, 8vw, 4rem)',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #6366F1, #14B8A6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            lineHeight: 1.1,
          }}>
            {scalarValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p style={{ color: '#64748B', fontSize: '0.875rem', marginTop: '0.75rem' }}>
            Differentially-private aggregate across all participating organizations
          </p>
        </div>
      )}

      {/* Grouped Results — Chart */}
      {isGrouped && chartData.length > 0 && (
        <div className="glass-card-static animate-slide-up" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#F8FAFC', marginBottom: '1.5rem' }}>Results by Group</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2D40" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#64748B', fontSize: 13 }}
                axisLine={{ stroke: '#1E2D40' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748B', fontSize: 13 }}
                axisLine={{ stroke: '#1E2D40' }}
                tickLine={false}
                tickFormatter={(v) => v.toLocaleString()}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15, 22, 35, 0.95)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(16px)',
                  color: '#F8FAFC',
                  fontSize: '14px',
                  fontFamily: "'Inter', sans-serif",
                }}
                cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
                formatter={(value: unknown) => [Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }), 'Value']}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={60}>
                {chartData.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Grouped Results — Table */}
      {isGrouped && chartData.length > 0 && (
        <div className="glass-card-static animate-slide-up" style={{ padding: '1.5rem', animationDelay: '0.2s' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#F8FAFC', marginBottom: '1rem' }}>Data Table</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} className="responsive-table">
              <thead>
                <tr style={{ borderBottom: '1px solid #1E2D40' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Group</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, i) => (
                  <tr key={row.name} style={{ borderBottom: '1px solid rgba(30,45,64,0.5)', transition: 'background 0.2s' }}>
                    <td className="flex items-center gap-3" style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#94A3B8' }}>
                      <div
                        style={{
                          width: 12, height: 12,
                          borderRadius: 9999,
                          backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                          flexShrink: 0,
                        }}
                      />
                      {row.name}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#F8FAFC', fontWeight: 600, textAlign: 'right', fontFamily: 'monospace' }}>
                      {row.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Completed Execution Checklist */}
      <div className="glass-card-static animate-slide-up" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#F8FAFC', marginBottom: '1rem' }}>Execution Checklist</h2>
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {COMPLETED_EXECUTION_STEPS.map((step) => (
            <div
              key={step}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                borderRadius: 10,
                background: 'rgba(20,184,166,0.08)',
                border: '1px solid rgba(20,184,166,0.2)',
              }}
            >
              <span style={{ fontSize: '0.85rem', color: '#CBD5E1' }}>{step}</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* Action */}
      <div className="flex gap-4 flex-wrap">
        <Link to="/query" className="btn-primary" id="btn-run-another">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Run Another Query
        </Link>
        <Link
          to="/history"
          className="btn-secondary"
        >
          View All History
        </Link>
      </div>
    </div>
  );
}

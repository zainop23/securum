import { useState, useEffect } from 'react';
import client from '../api/client';

interface BudgetData {
  totalBudget: number;
  spent: number;
  remaining: number;
  queryCount: number;
  history: Array<{
    query_id: string;
    epsilon_spent: string;
    created_at: string;
  }>;
}

export default function BudgetPage() {
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBudget = async () => {
      try {
        const { data } = await client.get('/orgs/me/privacy-budget');
        setBudget(data);
      } catch (err) {
        console.error('Failed to fetch budget:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBudget();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="skeleton" style={{ height: 32, width: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  if (!budget) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <p style={{ color: '#71717a' }}>Failed to load budget data</p>
      </div>
    );
  }

  const usagePercent = budget.totalBudget > 0 ? Math.min((budget.spent / budget.totalBudget) * 100, 100) : 0;
  const barColor = usagePercent > 80 ? '#ffb4ab' : usagePercent > 50 ? '#FCD34D' : '#4edea3';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div className="animate-fade-in">
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>Privacy Budget</h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem', fontSize: '0.9rem' }}>Track your differential privacy budget consumption</p>
      </div>

      {/* Budget Meter */}
      <div className="glass-card animate-pulse-glow animate-slide-up" style={{ padding: '2rem' }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Visual Meter */}
          <div className="md:col-span-2">
            <div className="flex justify-between items-end mb-3">
              <div>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>Budget Utilization</p>
                <p style={{ fontSize: '2.5rem', fontWeight: 700, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.1 }}>
                  {usagePercent.toFixed(1)}%
                </p>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#71717a' }}>
                ε {budget.spent.toFixed(2)} / {budget.totalBudget.toFixed(1)}
              </p>
            </div>

            {/* Progress Bar */}
            <div style={{ height: 8, background: 'rgba(190,242,100,0.08)', marginBottom: '1rem' }}>
              <div style={{ height: '100%', width: `${usagePercent}%`, background: barColor, transition: 'width 0.8s ease, background 0.3s ease' }} />
            </div>

            <div className="flex justify-between">
              <span style={{ fontSize: '0.7rem', color: '#52525b' }}>0</span>
              <span style={{ fontSize: '0.7rem', color: barColor, fontWeight: 600 }}>{budget.spent.toFixed(2)} spent</span>
              <span style={{ fontSize: '0.7rem', color: '#52525b' }}>ε {budget.totalBudget.toFixed(1)}</span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
            <div style={{ borderLeft: '2px solid #bef264', paddingLeft: '1rem' }}>
              <p style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#71717a', textTransform: 'uppercase' }}>Remaining</p>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#4edea3' }}>ε {budget.remaining.toFixed(2)}</p>
            </div>
            <div style={{ borderLeft: '2px solid rgba(190,242,100,0.15)', paddingLeft: '1rem' }}>
              <p style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#71717a', textTransform: 'uppercase' }}>Total Queries</p>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#e5e2e1' }}>{budget.queryCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Usage History */}
      <div className="glass-card-static animate-slide-up" style={{ overflow: 'hidden', animationDelay: '0.1s' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(190,242,100,0.05)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e5e2e1', fontFamily: "'Space Grotesk', sans-serif" }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: '#bef264', verticalAlign: 'middle', marginRight: '0.5rem' }}>history</span>
            Budget Usage History
          </h2>
        </div>
        {budget.history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: '#52525b', display: 'block', marginBottom: '0.75rem' }}>donut_large</span>
            <p style={{ color: '#71717a' }}>No queries have consumed budget yet</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} className="responsive-table">
              <thead>
                <tr style={{ background: 'rgba(14,14,14,0.5)' }}>
                  {['Query ID', 'Epsilon Spent', 'Date'].map((h) => (
                    <th key={h} style={{ textAlign: h === 'Epsilon Spent' ? 'right' : 'left', padding: '0.875rem 1.25rem', fontSize: '0.6rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {budget.history.map((entry, i) => (
                  <tr key={`${entry.query_id}-${i}`} className="animate-fade-in" style={{ borderTop: '1px solid rgba(190,242,100,0.05)', animationDelay: `${i * 0.03}s` }}>
                    <td style={{ padding: '0.75rem 1.25rem' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#a1a1aa', background: 'rgba(42,42,42,0.5)', padding: '0.15rem 0.5rem' }}>
                        {entry.query_id.slice(0, 8)}…
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 600, color: '#FCD34D' }}>
                      ε {parseFloat(entry.epsilon_spent).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem', fontSize: '0.8rem', color: '#52525b' }}>
                      {new Date(entry.created_at).toLocaleString()}
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

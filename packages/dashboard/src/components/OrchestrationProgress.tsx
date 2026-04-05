import { useState, useEffect, useRef } from 'react';

interface ProgressEvent {
  step: string;
  status: 'running' | 'done' | 'error';
  message: string;
  detail?: string;
  timestamp: number;
}

interface Props {
  queryId: string;
  onComplete: () => void;
  onError: (error: string) => void;
  onCancel?: () => void;
}

const STEP_ICONS: Record<string, { icon: string; label: string }> = {
  connected:        { icon: '', label: 'Connection' },
  budget_check:     { icon: '', label: 'Privacy Budget' },
  commit_broadcast: { icon: '', label: 'Commit Phase' },
  reveal_verify:    { icon: '', label: 'Reveal & Verify' },
  aggregation:      { icon: '', label: 'Aggregation' },
  finalize:         { icon: '', label: 'Finalization' },
  complete:         { icon: '', label: 'Complete' },
  error:            { icon: '', label: 'Error' },
};

export default function OrchestrationProgress({ queryId, onComplete, onError, onCancel }: Props) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('securum_token');
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

    const url = `${apiUrl}/query/${queryId}/events?token=${encodeURIComponent(token || '')}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (e) => {
      try {
        const event: ProgressEvent = JSON.parse(e.data);
        if (event.step === 'connected') return;

        setEvents((prev) => [...prev, event]);

        if (event.step === 'complete') {
          setTimeout(() => {
            es.close();
            onComplete();
          }, 800);
        }

        if (event.status === 'error') {
          es.close();
          onError(event.detail || event.message);
        }
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      if (!connected) {
        setTimeout(() => {
          es.close();
        }, 2000);
      }
    };

    return () => {
      es.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const handleCancel = async () => {
    setCancelling(true);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    try {
      const token = localStorage.getItem('securum_token');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      await fetch(`${apiUrl}/query/${queryId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch {
      // Best effort cancel
    } finally {
      if (onCancel) onCancel();
    }
  };

  const stepStatuses = new Map<string, 'running' | 'done' | 'error'>();
  for (const ev of events) {
    stepStatuses.set(ev.step, ev.status);
  }

  const getStatusIcon = (status: 'running' | 'done' | 'error') => {
    if (status === 'done') {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    }
    if (status === 'error') {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    }
    return <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />;
  };

  const getStatusColor = (status: 'running' | 'done' | 'error') => {
    if (status === 'done') return '#14B8A6';
    if (status === 'error') return '#F87171';
    return '#818cf8';
  };

  const hasCompleted = stepStatuses.get('complete') === 'done';
  const hasErrored = Array.from(stepStatuses.values()).includes('error');
  const isFinished = hasCompleted || hasErrored;

  const totalSteps = 5;
  const completedSteps = ['budget_check', 'commit_broadcast', 'reveal_verify', 'aggregation', 'finalize']
    .filter(s => stepStatuses.get(s) === 'done').length;
  const progressPct = hasCompleted ? 100 : Math.round((completedSteps / totalSteps) * 100);

  return (
    <div className="glass-card-static animate-slide-up" style={{ padding: '1.5rem', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: hasErrored ? '#F87171' : hasCompleted ? '#14B8A6' : '#818cf8',
            boxShadow: hasErrored
              ? '0 0 8px rgba(248,113,113,0.6)'
              : hasCompleted
                ? '0 0 8px rgba(20,184,166,0.6)'
                : '0 0 8px rgba(129,140,248,0.6)',
            animation: !hasCompleted && !hasErrored ? 'pulse-glow 2s infinite' : 'none',
          }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {cancelling ? 'Cancelling...' : hasCompleted ? 'Complete' : hasErrored ? 'Failed' : 'Orchestration In Progress'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {!isFinished && !cancelling && onCancel && (
            <button
              onClick={handleCancel}
              style={{
                fontSize: '0.75rem',
                color: '#94A3B8',
                background: 'transparent',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                padding: '2px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = '#F87171'; e.currentTarget.style.borderColor = '#F87171'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.3)'; }}
            >
              Cancel
            </button>
          )}
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: hasCompleted ? '#14B8A6' : '#818cf8',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: 4,
        borderRadius: 99,
        background: 'rgba(99,102,241,0.1)',
        marginBottom: '1.25rem',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          borderRadius: 99,
          width: `${progressPct}%`,
          background: hasErrored
            ? 'linear-gradient(90deg, #F87171, #ef4444)'
            : hasCompleted
              ? 'linear-gradient(90deg, #14B8A6, #2dd4bf)'
              : 'linear-gradient(90deg, #6366F1, #818cf8)',
          transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: 320,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {events.length === 0 && !hasErrored && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            <span style={{ fontSize: '0.85rem', color: '#64748B' }}>Connecting to orchestration stream…</span>
          </div>
        )}

        {events.map((ev, idx) => {
          const stepInfo = STEP_ICONS[ev.step] || { icon: '•', label: ev.step };
          const isLatest = idx === events.length - 1;

          return (
            <div
              key={idx}
              className="animate-fade-in"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 10,
                background: isLatest && ev.status === 'running'
                  ? 'rgba(99,102,241,0.06)'
                  : ev.status === 'error'
                    ? 'rgba(239,68,68,0.06)'
                    : 'transparent',
                borderLeft: `3px solid ${getStatusColor(ev.status)}`,
                transition: 'all 0.3s ease',
              }}
            >
              {/* Status icon */}
              <div style={{ flexShrink: 0, marginTop: 2 }}>
                {getStatusIcon(ev.status)}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{stepInfo.icon}</span>
                  <span style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: ev.status === 'error' ? '#F87171' : '#F8FAFC',
                  }}>
                    {ev.message}
                  </span>
                </div>
                {ev.detail && (
                  <p style={{
                    fontSize: '0.75rem',
                    color: '#64748B',
                    marginTop: '0.15rem',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                  }}>
                    {ev.detail}
                  </p>
                )}
              </div>

              {/* Timestamp */}
              <span style={{
                fontSize: '0.65rem',
                color: '#475569',
                flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
                marginTop: 4,
              }}>
                {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

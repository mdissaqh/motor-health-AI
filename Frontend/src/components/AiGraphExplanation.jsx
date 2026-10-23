import React, { useState, useEffect } from 'react';
import { api } from '../api';

/**
 * Reusable Hugging Face AI Graph Explanation Panel.
 * Automatically fetches (or fetches on-demand) grounded explanations for any analytical chart.
 */
export default function AiGraphExplanation({
  graphType,
  chartStatistics = {},
  operatingConditions = {},
  predictedClass = 'HEALTHY',
  autoLoad = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const fetchExplanation = async () => {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const res = await api.explainGraph({
        graph_type: graphType,
        chart_statistics: chartStatistics,
        operating_conditions: operatingConditions,
        predicted_class: predictedClass,
      });

      if (res.status === 'SUCCESS' && res.data) {
        setData(res.data);
      } else {
        throw new Error(res.message || 'Failed to fetch graph explanation.');
      }
    } catch (err) {
      setError(err.message || 'Could not load explanation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad && !data && !loading) {
      fetchExplanation();
    }
  }, [graphType, autoLoad]);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState && !data && !loading) {
      fetchExplanation();
    }
  };

  return (
    <div
      style={{
        marginTop: '0.75rem',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        background: 'rgba(10, 14, 23, 0.6)',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={handleToggle}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.6rem 0.85rem',
          cursor: 'pointer',
          background: isOpen ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
          transition: 'background 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem' }}>✨</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#a5b4fc' }}>
            Hugging Face AI Graph Explanation
          </span>
          {data && (
            <span
              className="badge"
              style={{
                fontSize: '0.65rem',
                background: data.provider === 'HUGGING_FACE_AI' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(6, 182, 212, 0.15)',
                color: data.provider === 'HUGGING_FACE_AI' ? '#c084fc' : '#38bdf8',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {data.provider === 'HUGGING_FACE_AI' ? `HF: ${data.model}` : 'Physics Fallback'}
            </span>
          )}
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
        >
          {isOpen ? 'Hide AI Explanation ▲' : 'Explain this Chart ▼'}
        </button>
      </div>

      {isOpen && (
        <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.8rem', color: 'var(--text-main)', background: 'var(--bg-surface-elevated)' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0' }}>
              <span className="spinner" style={{ width: '14px', height: '14px' }} />
              <span style={{ color: 'var(--text-muted)' }}>Querying Hugging Face AI engine...</span>
            </div>
          )}

          {error && (
            <div style={{ color: 'var(--rose-danger)', background: 'var(--rose-bg)', border: '1px solid var(--rose-border)', padding: '0.5rem', borderRadius: '6px' }}>
              ⚠️ {error}
            </div>
          )}

          {data && data.explanation && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', lineHeight: 1.5 }}>
              <div>
                <strong style={{ color: 'var(--navy-primary)' }}>1. What it displays: </strong>
                <span>{data.explanation.what_it_displays}</span>
              </div>
              <div>
                <strong style={{ color: 'var(--blue-accent)' }}>2. Observed signal pattern: </strong>
                <span>{data.explanation.visible_pattern}</span>
              </div>
              <div>
                <strong style={{ color: 'var(--amber-warning)' }}>3. Relevance to MCSA: </strong>
                <span>{data.explanation.relevance_to_mcsa}</span>
              </div>
              <div>
                <strong style={{ color: 'var(--emerald-success)' }}>4. What this supports: </strong>
                <span>{data.explanation.what_it_supports}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.4rem', marginTop: '0.2rem' }}>
                <strong style={{ color: 'var(--text-main)' }}>Scientific limitation: </strong>
                <span>{data.explanation.limitations}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

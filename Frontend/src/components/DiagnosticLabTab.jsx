import React, { useState, useEffect } from 'react';
import SignalCanvas from './SignalCanvas';
import { api } from '../api';

export default function DiagnosticLabTab({
  selectedRun,
  linkedWorkOrder,
  onNavigateToDiagnose,
  onOpenWorkOrder,
}) {
  const [activeSignalView, setActiveSignalView] = useState('both'); // 'both' | 'spectrum' | 'waveform'

  // Hugging Face Open-Source AI Agentic Guide State
  const [mentorData, setMentorData] = useState(null);
  const [mentorLoading, setMentorLoading] = useState(false);
  const [mentorError, setMentorError] = useState('');

  // Fetch Hugging Face AI guidance whenever selectedRun changes
  useEffect(() => {
    if (!selectedRun) {
      setMentorData(null);
      return;
    }

    let isMounted = true;
    const fetchMentorGuidance = async () => {
      setMentorLoading(true);
      setMentorError('');
      try {
        const res = await api.recommendMaintenance({
          diagnostic_run: selectedRun,
          motor: {
            tag: selectedRun.motor_tag,
            name: selectedRun.motor_name,
            operating_conditions: selectedRun.operating_conditions,
          },
        });

        if (isMounted) {
          if (res.status === 'SUCCESS' && res.data) {
            setMentorData(res.data);
          } else {
            setMentorError(res.message || 'Could not load AI guidance.');
          }
        }
      } catch (err) {
        if (isMounted) {
          setMentorError(err.message || 'Error connecting to AI mentor.');
        }
      } finally {
        if (isMounted) setMentorLoading(false);
      }
    };

    fetchMentorGuidance();

    return () => {
      isMounted = false;
    };
  }, [selectedRun?.id]);

  if (!selectedRun) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚡</div>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#fff' }}>
          Motor Diagnostic & Signal Lab
        </h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto 1.5rem' }}>
          No motor recording is currently selected. Run a diagnosis or pick a past test to view the graphs, simple report, and technician AI guide.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNavigateToDiagnose}
        >
          Diagnose a Motor Now →
        </button>
      </div>
    );
  }

  const status = selectedRun.diagnostic_status || 'UNKNOWN';
  const predictedClass = selectedRun.predicted_class || 'None';
  const confidence = selectedRun.model_confidence ? (selectedRun.model_confidence * 100).toFixed(1) : 'N/A';
  const healthIndex = typeof selectedRun.health_index === 'number' ? selectedRun.health_index.toFixed(0) : 'N/A';
  const plottingData = selectedRun.plotting_data || null;
  const severity = selectedRun.severity || {};
  const rawScores = selectedRun.raw_class_scores || {};
  const calProbs = selectedRun.calibrated_probabilities || {};

  // Simple Plain-English Fault Meta
  const getFaultMeta = (cls) => {
    switch (cls) {
      case 'HEALTHY':
        return {
          title: 'Normal / Healthy Operation',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.15)',
          border: 'rgba(16, 185, 129, 0.3)',
          badgeClass: 'badge-emerald',
          icon: '✅',
          desc: 'The motor current is balanced with no abnormal electrical or mechanical defects detected.',
        };
      case 'BROKEN_ROTOR_BAR':
        return {
          title: 'Possible Broken Rotor Bar (BRB)',
          color: '#f43f5e',
          bg: 'rgba(244, 63, 94, 0.15)',
          border: 'rgba(244, 63, 94, 0.35)',
          badgeClass: 'badge-rose',
          icon: '⚠️',
          desc: 'Cracked or broken rotor cage bar detected. Creates cyclic torque oscillations and harmonic sidebands.',
        };
      case 'BEARING_FAULT':
        return {
          title: 'Possible Bearing Raceway Wear',
          color: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.15)',
          border: 'rgba(245, 158, 11, 0.35)',
          badgeClass: 'badge-amber',
          icon: '⚠️',
          desc: 'Mechanical wear detected on bearing raceways or rolling elements, causing high-frequency impact pulses.',
        };
      case 'MISALIGNMENT':
        return {
          title: 'Shaft Misalignment Detected',
          color: '#eab308',
          bg: 'rgba(234, 179, 8, 0.15)',
          border: 'rgba(234, 179, 8, 0.35)',
          badgeClass: 'badge-amber',
          icon: '⚠️',
          desc: 'Motor shaft and driven load shaft are misaligned or coupling is offset, generating 2x line frequency stress.',
        };
      default:
        return {
          title: cls,
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.15)',
          border: 'rgba(56, 189, 248, 0.3)',
          badgeClass: 'badge-cyan',
          icon: '🔍',
          desc: 'Condition diagnosed from motor current signature analysis.',
        };
    }
  };

  const faultMeta = getFaultMeta(predictedClass);
  const recs = mentorData?.recommendations || {};

  return (
    <div>
      {/* =========================================================================
          SECTION 1: SIMPLE MOTOR OUTPUT & DIAGNOSTIC REPORT
          ========================================================================= */}
      <div
        className="card"
        style={{
          marginBottom: '1.5rem',
          borderLeft: `5px solid ${faultMeta.color}`,
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
          {/* Motor Name & Condition */}
          <div style={{ flex: '1 1 360px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.3)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                MOTOR: {selectedRun.motor_tag}
              </span>
              <span className={`badge ${faultMeta.badgeClass}`} style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
                {faultMeta.icon} {status === 'DIAGNOSIS_AVAILABLE' ? 'DIAGNOSIS COMPLETE' : status}
              </span>
              <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
                {selectedRun.operating_conditions?.load_condition || 'Variable Load'} • {selectedRun.operating_conditions?.nominal_frequency_hz || 50} Hz
              </span>
            </div>

            <h1 style={{ fontSize: '1.5rem', margin: '0.25rem 0', color: '#fff', fontWeight: 700 }}>
              {selectedRun.motor_name}
            </h1>

            {/* Simple Result Banner */}
            <div
              style={{
                marginTop: '0.85rem',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                background: faultMeta.bg,
                border: `1px solid ${faultMeta.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
              }}
            >
              <div style={{ fontSize: '1.75rem', lineHeight: 1 }}>{faultMeta.icon}</div>
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                  Result: <span style={{ color: faultMeta.color }}>{faultMeta.title}</span>
                </div>
                <div style={{ fontSize: '0.825rem', color: '#cbd5e1', marginTop: '0.15rem' }}>
                  {faultMeta.desc}
                </div>
              </div>
            </div>
          </div>

          {/* Key Metrics: Confidence, Health, Severity */}
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ textAlign: 'center', minWidth: '85px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                AI Confidence
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#38bdf8', lineHeight: 1.2 }}>
                {confidence}%
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                Accurate Detection
              </span>
            </div>

            <div style={{ textAlign: 'center', minWidth: '85px', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '1.25rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                Health Score
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: Number(healthIndex) > 70 ? '#34d399' : Number(healthIndex) > 40 ? '#fbbf24' : '#f87171', lineHeight: 1.2 }}>
                {healthIndex}/100
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                {Number(healthIndex) > 70 ? 'Good Condition' : 'Needs Attention'}
              </span>
            </div>

            <div style={{ textAlign: 'center', minWidth: '95px', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '1.25rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                Severity
              </span>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.35rem' }}>
                {severity.severity_level || severity.status || 'Normal'}
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                {severity.standard_reference || 'EPRI / ISO'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: HEALTHY VS DEFECTS CLASSIFICATION (RANKED ORDER)
          Placed directly on top of the graphs section
          ========================================================================= */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🔍</span> Motor Condition & Defect Classification
            </h3>
            <p className="card-desc">
              Ranked in order of confidence: the most likely condition appears first (#1), followed by the next most likely modes.
            </p>
          </div>
          <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
            Ranked by Confidence (Highest First)
          </span>
        </div>

        {/* 4 Cards Grid: Healthy vs Defects - Sorted in descending order of confidence */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '0.25rem' }}>
          {[
            {
              key: 'HEALTHY',
              label: 'Healthy Motor',
              type: 'HEALTHY',
              typeLabel: 'Nominal Baseline',
              color: '#10b981',
              bgActive: 'rgba(16, 185, 129, 0.12)',
              borderActive: 'rgba(16, 185, 129, 0.4)',
              icon: '🟢',
            },
            {
              key: 'BROKEN_ROTOR_BAR',
              label: 'Broken Rotor Bar',
              type: 'DEFECT',
              typeLabel: 'Rotor Cage Defect',
              color: '#f43f5e',
              bgActive: 'rgba(244, 63, 94, 0.12)',
              borderActive: 'rgba(244, 63, 94, 0.4)',
              icon: '🔴',
            },
            {
              key: 'BEARING_FAULT',
              label: 'Bearing Raceway Wear',
              type: 'DEFECT',
              typeLabel: 'Mechanical Bearing Defect',
              color: '#f59e0b',
              bgActive: 'rgba(245, 158, 11, 0.12)',
              borderActive: 'rgba(245, 158, 11, 0.4)',
              icon: '🟠',
            },
            {
              key: 'MISALIGNMENT',
              label: 'Shaft Misalignment',
              type: 'DEFECT',
              typeLabel: 'Coupling / Offset Defect',
              color: '#a855f7',
              bgActive: 'rgba(168, 85, 247, 0.12)',
              borderActive: 'rgba(168, 85, 247, 0.4)',
              icon: '🟣',
            },
          ]
            .map((item) => {
              const isTop = predictedClass === item.key;
              const calVal = calProbs[item.key] !== undefined
                ? (calProbs[item.key] * 100).toFixed(1)
                : (isTop ? (parseFloat(confidence) || 95.0).toFixed(1) : '0.0');
              const rawVal = rawScores[item.key] !== undefined
                ? (rawScores[item.key] * 100).toFixed(1)
                : calVal;
              const pct = Math.min(100, Math.max(0, parseFloat(calVal) || 0));
              return { ...item, isTop, calVal, rawVal, pct };
            })
            // Sort in order of performance/confidence: highest comes first, next highest after
            .sort((a, b) => b.pct - a.pct)
            .map((item, rankIndex) => {
              const isTop = item.isTop;

              return (
                <div
                  key={item.key}
                  style={{
                    background: isTop ? item.bgActive : 'rgba(15, 23, 42, 0.5)',
                    border: `1px solid ${isTop ? item.borderActive : 'var(--border-subtle)'}`,
                    borderRadius: '8px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isTop ? `0 4px 15px -3px ${item.borderActive}` : 'none',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: item.type === 'HEALTHY' ? '#34d399' : '#fca5a5',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <span style={{ opacity: 0.7 }}>#{rankIndex + 1}</span>
                        {item.type === 'HEALTHY' ? '🟢 ' : '⚠️ '}{item.typeLabel}
                      </span>
                      {isTop ? (
                        <span className="badge" style={{ background: item.color, color: '#0f172a', fontWeight: 800, fontSize: '0.65rem' }}>
                          ★ DETECTED
                        </span>
                      ) : (
                        <span className="mono" style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                          Rank #{rankIndex + 1}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: isTop ? '#fff' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        Confidence
                      </span>
                      <span className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: isTop ? item.color : 'var(--text-muted)' }}>
                        {item.calVal}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${item.pct}%`,
                          height: '100%',
                          background: isTop
                            ? `linear-gradient(90deg, ${item.color}, #38bdf8)`
                            : '#475569',
                          borderRadius: '3px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                      <span>{isTop ? 'Active Diagnostic Match' : 'Nominal / Unobserved'}</span>
                      <span>Raw: {item.rawVal}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: MOTOR CURRENT SIGNAL GRAPHS (EASY VISUAL VIEW)
          ========================================================================= */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header" style={{ alignItems: 'center' }}>
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📈</span> Motor Current Signal Graphs
            </h3>
            <p className="card-desc">
              Visual waveform and frequency analysis generated directly from the motor's electrical current sensors.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              className={`btn btn-sm ${activeSignalView === 'both' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveSignalView('both')}
            >
              Dual View
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeSignalView === 'waveform' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveSignalView('waveform')}
            >
              Waveform i(t)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeSignalView === 'spectrum' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveSignalView('spectrum')}
            >
              Frequency Spectrum (FFT)
            </button>
          </div>
        </div>

        {plottingData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Waveform View */}
            {(activeSignalView === 'both' || activeSignalView === 'waveform') && (
              <div>
                <SignalCanvas
                  mode="time"
                  data={plottingData}
                  height={200}
                  title="Stator Current Waveform i(t) — Raw Electric Flow Over Time"
                  units="Amperes (A)"
                />
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem', padding: '0 0.5rem' }}>
                  ℹ️ <strong>What this shows:</strong> The actual AC current wave traveling through the motor windings. Smooth oscillations indicate normal operation, while sudden bumps or uneven waves indicate physical resistance or magnetic unevenness.
                </div>
              </div>
            )}

            {/* Spectrum View */}
            {(activeSignalView === 'both' || activeSignalView === 'spectrum') && (
              <div>
                <SignalCanvas
                  mode="spectrum"
                  data={plottingData}
                  height={240}
                  title="Frequency Spectrum (FFT) — Acoustic & Magnetic Vibration Harmonics (0 to 160 Hz)"
                  units="Decibels (dB)"
                />
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem', padding: '0 0.5rem' }}>
                  ℹ️ <strong>What this shows:</strong> The motor's unique "electrical heartbeat". The tall spike in the center is the 50 Hz power supply. Unwanted spikes flanking it on the sides indicate internal mechanical faults like broken rotor bars or worn bearings.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No visual waveform data available for this motor run.
          </div>
        )}
      </div>

      {/* =========================================================================
          SECTION 4: HUGGING FACE OPEN-SOURCE AI GUIDE — WHAT NEXT TO DO TO FIX ISSUES
          ========================================================================= */}
      <div
        className="card"
        style={{
          marginBottom: '1.5rem',
          border: '1px solid rgba(168, 85, 247, 0.4)',
          background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.6), rgba(15, 23, 42, 0.9))',
          boxShadow: '0 10px 25px -5px rgba(168, 85, 247, 0.1)',
        }}
      >
        <div className="card-header" style={{ borderBottom: '1px solid rgba(168, 85, 247, 0.2)', paddingBottom: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span style={{ fontSize: '1.25rem' }}>🤖</span>
              <h3 className="card-title" style={{ color: '#c084fc', fontSize: '1.15rem' }}>
                Hugging Face AI Technician Guide — How to Fix Issues
              </h3>
              <span
                className="badge"
                style={{
                  background: 'rgba(168, 85, 247, 0.2)',
                  color: '#e9d5ff',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  fontSize: '0.72rem',
                }}
              >
                {mentorData?.provider === 'HUGGING_FACE_AI' ? `HF: ${mentorData.model}` : 'Physics Fallback Engine'}
              </span>
            </div>
            <p className="card-desc" style={{ color: '#cbd5e1' }}>
              Plain-English guidance on what issue was found and simple, step-by-step instructions on what to do next to inspect and fix it.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              setMentorLoading(true);
              setMentorError('');
              try {
                const res = await api.recommendMaintenance({
                  diagnostic_run: selectedRun,
                  motor: { tag: selectedRun.motor_tag, name: selectedRun.motor_name },
                });
                if (res.status === 'SUCCESS' && res.data) setMentorData(res.data);
              } catch (e) {
                setMentorError(e.message);
              } finally {
                setMentorLoading(false);
              }
            }}
            disabled={mentorLoading}
            style={{ fontSize: '0.78rem' }}
          >
            {mentorLoading ? '✨ Asking AI...' : '🔄 Refresh AI Guide'}
          </button>
        </div>

        {mentorLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div className="spinner" style={{ width: '28px', height: '28px', margin: '0 auto 0.75rem' }} />
            <div style={{ color: '#c084fc', fontWeight: 600 }}>Analyzing diagnostic results with Hugging Face AI guide...</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Generating simple, step-by-step repair and inspection instructions
            </div>
          </div>
        ) : mentorError ? (
          <div style={{ padding: '1rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px' }}>
            ⚠️ {mentorError}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '0.5rem' }}>
            {/* 1. What the issue is (Simple explanation) */}
            <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '1rem' }}>💡</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  What is the Issue? (Simple Summary)
                </span>
              </div>
              <p style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.5, margin: 0 }}>
                {recs.engineering_justification || recs.suspected_condition || faultMeta.desc}
              </p>
            </div>

            {/* 2. What the graphs show */}
            {recs.what_graphs_show && (
              <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '1rem' }}>📊</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    What the Graphs Show
                  </span>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#e2e8f0', lineHeight: 1.5, margin: 0 }}>
                  {recs.what_graphs_show}
                </p>
              </div>
            )}

            {/* 3. Simple Step-by-Step Fix / Repair Guide: What next to do to fix issues */}
            <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>🛠️</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    What Next to Do to Fix & Inspect this Motor
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <span className={`badge ${recs.suggested_priority === 'CRITICAL' ? 'badge-rose' : recs.suggested_priority === 'HIGH' ? 'badge-amber' : 'badge-emerald'}`}>
                    Action Priority: {recs.suggested_priority || 'NORMAL'}
                  </span>
                </div>
              </div>

              {/* Numbered Action Steps */}
              {Array.isArray(recs.recommended_inspection_tasks) && recs.recommended_inspection_tasks.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {recs.recommended_inspection_tasks.map((task, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.03)',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '6px',
                        borderLeft: '3px solid #34d399',
                      }}
                    >
                      <span
                        style={{
                          background: '#10b981',
                          color: '#0f172a',
                          fontWeight: 800,
                          fontSize: '0.75rem',
                          borderRadius: '50%',
                          minWidth: '22px',
                          height: '22px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: '0.1rem',
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: '#f1f5f9', lineHeight: 1.45 }}>
                        {task}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                  Routine monitoring: Inspect general operating noise, ventilation cleanliness, and standard lubrication schedule.
                </p>
              )}

              {/* Follow-up re-check interval */}
              {recs.follow_up_checks && (
                <div style={{ marginTop: '0.85rem', padding: '0.6rem 0.85rem', background: 'rgba(56, 189, 248, 0.08)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: '0.825rem', color: '#bae6fd' }}>
                  ⏱️ <strong>Follow-Up Re-Check:</strong> {recs.follow_up_checks}
                </div>
              )}

              {/* Verification & Human Sign-off Notice */}
              <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  🔒 <strong>Technician Safety Rule:</strong> Always conduct physical verification before replacing expensive motor components.
                </div>

                {linkedWorkOrder && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onOpenWorkOrder && onOpenWorkOrder(linkedWorkOrder.id)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                  >
                    Open Maintenance Work Order #{linkedWorkOrder.id} →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

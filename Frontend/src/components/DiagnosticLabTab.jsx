import React, { useState, useEffect } from 'react';
import SignalCanvas from './SignalCanvas';
import { api } from '../api';

export default function DiagnosticLabTab({
  selectedRun,
  linkedWorkOrder,
  onNavigateToDiagnose,
  onNavigateTo3D,
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
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--navy-primary)' }}>
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
          color: '#16A879',
          bg: '#E6F8F2',
          border: '#A3E9D2',
          badgeClass: 'badge-emerald',
          icon: '✅',
          desc: 'The motor current is balanced with no abnormal electrical or mechanical defects detected.',
        };
      case 'BROKEN_ROTOR_BAR':
        return {
          title: 'Possible Broken Rotor Bar (BRB)',
          color: '#DC4C64',
          bg: '#FDF1F3',
          border: '#F9BAC5',
          badgeClass: 'badge-rose',
          icon: '⚠️',
          desc: 'Cracked or broken rotor cage bar detected. Creates cyclic torque oscillations and harmonic sidebands.',
        };
      case 'BEARING_FAULT':
        return {
          title: 'Possible Bearing Raceway Wear',
          color: '#E9A23B',
          bg: '#FEF7EC',
          border: '#FCD8A2',
          badgeClass: 'badge-amber',
          icon: '⚠️',
          desc: 'Mechanical wear detected on bearing raceways or rolling elements, causing high-frequency impact pulses.',
        };
      case 'MISALIGNMENT':
        return {
          title: 'Shaft Misalignment Detected',
          color: '#7E22CE',
          bg: '#F5EEFD',
          border: '#D8B4FE',
          badgeClass: 'badge-purple',
          icon: '⚠️',
          desc: 'Motor shaft and driven load shaft are misaligned or coupling is offset, generating 2x line frequency stress.',
        };
      default:
        return {
          title: cls,
          color: '#087ACB',
          bg: '#EFF6FF',
          border: '#BFDBFE',
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
          background: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
          {/* Motor Name & Condition */}
          <div style={{ flex: '1 1 360px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--navy-primary)', background: 'var(--bg-surface-elevated)', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                MOTOR: {selectedRun.motor_tag}
              </span>
              <span className={`badge ${faultMeta.badgeClass}`} style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
                {faultMeta.icon} {status === 'DIAGNOSIS_AVAILABLE' ? 'DIAGNOSIS COMPLETE' : status}
              </span>
              <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
                {selectedRun.operating_conditions?.load_condition || 'Variable Load'} • {selectedRun.operating_conditions?.nominal_frequency_hz || 50} Hz
              </span>
            </div>

            <h1 style={{ fontSize: '1.5rem', margin: '0.25rem 0', color: 'var(--navy-primary)', fontWeight: 800 }}>
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
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy-primary)' }}>
                  Result: <span style={{ color: faultMeta.color }}>{faultMeta.title}</span>
                </div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  {faultMeta.desc}
                </div>
              </div>
            </div>
          </div>

          {/* Key Metrics: Confidence, Health, Severity */}
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', background: 'var(--bg-surface-elevated)', padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ textAlign: 'center', minWidth: '85px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
                AI Confidence
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--blue-accent)', lineHeight: 1.2 }}>
                {confidence}%
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                Accurate Detection
              </span>
            </div>

            <div style={{ textAlign: 'center', minWidth: '85px', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '1.25rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
                Health Score
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: Number(healthIndex) > 70 ? 'var(--emerald-success)' : Number(healthIndex) > 40 ? 'var(--amber-warning)' : 'var(--rose-danger)', lineHeight: 1.2 }}>
                {healthIndex}/100
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                {Number(healthIndex) > 70 ? 'Good Condition' : 'Needs Attention'}
              </span>
            </div>

            <div style={{ textAlign: 'center', minWidth: '95px', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '1.25rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
                Severity
              </span>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--amber-warning)', marginTop: '0.35rem' }}>
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
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
              Ranked by Confidence (Highest First)
            </span>
            {onNavigateTo3D && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onNavigateTo3D}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', fontWeight: 600 }}
              >
                🧊 View in 3D Motor Twin →
              </button>
            )}
          </div>
        </div>

        {/* 4 Cards Grid: Healthy vs Defects - Sorted in descending order of confidence */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '0.25rem' }}>
          {[
            {
              key: 'HEALTHY',
              label: 'Healthy Motor',
              type: 'HEALTHY',
              typeLabel: 'Nominal Baseline',
              color: '#16A879',
              bgActive: '#E6F8F2',
              borderActive: '#A3E9D2',
              icon: '🟢',
            },
            {
              key: 'BROKEN_ROTOR_BAR',
              label: 'Broken Rotor Bar',
              type: 'DEFECT',
              typeLabel: 'Rotor Cage Defect',
              color: '#DC4C64',
              bgActive: '#FDF1F3',
              borderActive: '#F9BAC5',
              icon: '🔴',
            },
            {
              key: 'BEARING_FAULT',
              label: 'Bearing Raceway Wear',
              type: 'DEFECT',
              typeLabel: 'Mechanical Bearing Defect',
              color: '#E9A23B',
              bgActive: '#FEF7EC',
              borderActive: '#FCD8A2',
              icon: '🟠',
            },
            {
              key: 'MISALIGNMENT',
              label: 'Shaft Misalignment',
              type: 'DEFECT',
              typeLabel: 'Coupling / Offset Defect',
              color: '#7E22CE',
              bgActive: '#F5EEFD',
              borderActive: '#D8B4FE',
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
            .sort((a, b) => b.pct - a.pct)
            .map((item, rankIndex) => {
              const isTop = item.isTop;

              return (
                <div
                  key={item.key}
                  style={{
                    background: isTop ? item.bgActive : 'var(--bg-surface)',
                    border: `1px solid ${isTop ? item.borderActive : 'var(--border-subtle)'}`,
                    borderRadius: '8px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isTop ? `0 4px 15px -3px rgba(7, 59, 120, 0.1)` : 'none',
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
                          color: item.type === 'HEALTHY' ? 'var(--emerald-success)' : 'var(--rose-danger)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <span style={{ opacity: 0.8 }}>#{rankIndex + 1}</span>
                        {item.type === 'HEALTHY' ? '🟢 ' : '⚠️ '}{item.typeLabel}
                      </span>
                      {isTop ? (
                        <span className="badge" style={{ background: item.color, color: '#fff', fontWeight: 800, fontSize: '0.65rem' }}>
                          ★ DETECTED
                        </span>
                      ) : (
                        <span className="mono" style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                          Rank #{rankIndex + 1}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        Confidence
                      </span>
                      <span className="mono" style={{ fontSize: '1rem', fontWeight: 800, color: isTop ? item.color : 'var(--text-muted)' }}>
                        {item.calVal}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${item.pct}%`,
                          height: '100%',
                          background: isTop
                            ? `linear-gradient(90deg, ${item.color}, var(--blue-accent))`
                            : '#94A3B8',
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
          border: '1px solid #C7D2FE',
          background: 'linear-gradient(135deg, #EEF2FF 0%, #FFFFFF 100%)',
          boxShadow: '0 8px 24px -4px rgba(79, 70, 229, 0.08)',
        }}
      >
        <div className="card-header" style={{ borderBottom: '1px solid #E0E7FF', paddingBottom: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span style={{ fontSize: '1.25rem' }}>🤖</span>
              <h3 className="card-title" style={{ color: '#4338CA', fontSize: '1.15rem' }}>
                Hugging Face AI Technician Guide — How to Fix Issues
              </h3>
              <span
                className="badge"
                style={{
                  background: '#E0E7FF',
                  color: '#3730A3',
                  border: '1px solid #C7D2FE',
                  fontSize: '0.72rem',
                }}
              >
                {mentorData?.provider === 'HUGGING_FACE_AI' ? `HF: ${mentorData.model}` : 'Physics Fallback Engine'}
              </span>
            </div>
            <p className="card-desc" style={{ color: 'var(--text-muted)' }}>
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
            <div style={{ color: '#4338CA', fontWeight: 700 }}>Analyzing diagnostic results with Hugging Face AI guide...</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Generating simple, step-by-step repair and inspection instructions
            </div>
          </div>
        ) : mentorError ? (
          <div style={{ padding: '1rem', color: '#BE123C', background: 'var(--rose-bg)', borderRadius: '6px', border: '1px solid var(--rose-border)' }}>
            ⚠️ {mentorError}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '0.5rem' }}>
            {/* 1. What the issue is (Simple explanation) */}
            <div style={{ background: '#FFFFFF', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '1rem' }}>💡</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  What is the Issue? (Simple Summary)
                </span>
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.5, margin: 0 }}>
                {recs.engineering_justification || recs.suspected_condition || faultMeta.desc}
              </p>
            </div>

            {/* 2. What the graphs show */}
            {recs.what_graphs_show && (
              <div style={{ background: '#FFFFFF', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '1rem' }}>📊</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4338CA', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    What the Graphs Show
                  </span>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-main)', lineHeight: 1.5, margin: 0 }}>
                  {recs.what_graphs_show}
                </p>
              </div>
            )}

            {/* 3. Simple Step-by-Step Fix / Repair Guide: What next to do to fix issues */}
            <div style={{ background: '#FFFFFF', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>🛠️</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                        background: 'var(--bg-surface-elevated)',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '6px',
                        borderLeft: '3px solid var(--emerald-success)',
                      }}
                    >
                      <span
                        style={{
                          background: 'var(--emerald-success)',
                          color: '#fff',
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
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
                        {task}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Routine monitoring: Inspect general operating noise, ventilation cleanliness, and standard lubrication schedule.
                </p>
              )}

              {/* Follow-up re-check interval */}
              {recs.follow_up_checks && (
                <div style={{ marginTop: '0.85rem', padding: '0.6rem 0.85rem', background: '#EFF6FF', borderRadius: '6px', border: '1px solid #BFDBFE', fontSize: '0.825rem', color: '#1E40AF' }}>
                  ⏱️ <strong>Follow-Up Re-Check:</strong> {recs.follow_up_checks}
                </div>
              )}

              {/* Verification & Human Sign-off Notice */}
              <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
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

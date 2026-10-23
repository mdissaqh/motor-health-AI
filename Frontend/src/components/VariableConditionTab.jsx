import React, { useState } from 'react';
import { api } from '../api';
import SignalCanvas from './SignalCanvas';

export default function VariableConditionTab({ onSelectRun }) {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [selectedCaseIdx, setSelectedCaseIdx] = useState(0);

  const testCases = [
    {
      id: 'case_nominal',
      title: 'Regime 1: Nominal Speed & Full Load',
      condition: '1470 RPM / 50 Hz / 100% Load',
      fault_class: 'BROKEN_ROTOR_BAR',
      ground_truth: 'BROKEN_ROTOR_BAR',
      rpm: 1460,
      fs: 5000,
      load_pct: 100,
      seed: 43,
      expected_outcome: 'High Confidence Diagnosis (s = 0.0267)',
      note: 'Wide sideband separation (~2.67 Hz from 50 Hz fundamental). Classical MCSA benchmark.',
    },
    {
      id: 'case_vfd_speed',
      title: 'Regime 2: Held-Out VFD Speed (60 Hz)',
      condition: '1750 RPM / 60 Hz / 100% Load',
      fault_class: 'BROKEN_ROTOR_BAR',
      ground_truth: 'BROKEN_ROTOR_BAR',
      rpm: 1750,
      fs: 5000,
      load_pct: 100,
      seed: 101,
      expected_outcome: 'Adaptive Fundamental Tracking (f_fund = 60 Hz)',
      note: 'Synchronous speed shifts to 1800 RPM. Pipeline dynamically locks to 60.0 Hz fundamental.',
    },
    {
      id: 'case_light_load',
      title: 'Regime 3: Held-Out Light Load (50% Load)',
      condition: '1488 RPM / 50 Hz / 50% Load',
      fault_class: 'BROKEN_ROTOR_BAR',
      ground_truth: 'BROKEN_ROTOR_BAR',
      rpm: 1488,
      fs: 5000,
      load_pct: 50,
      seed: 102,
      expected_outcome: 'Reduced Slip Resolution (s = 0.008)',
      note: 'Sidebands compress closer to carrier ((1-2s)fs ≈ 49.2 Hz). Requires high-resolution FFT.',
    },
    {
      id: 'case_near_zero_slip',
      title: 'Regime 4: Boundary Edge Case (Slip < 0.002)',
      condition: '1498 RPM / 50 Hz / No Load',
      fault_class: 'HEALTHY',
      ground_truth: 'HEALTHY (Unloaded)',
      rpm: 1498,
      fs: 5000,
      load_pct: 0,
      seed: 999,
      expected_outcome: 'UNSUPPORTED_CONDITION Refusal',
      note: 'Slip falls below 0.002. Steady-state sidebands merge into carrier. System strictly refuses false diagnosis.',
    },
  ];

  const handleRunChallenge = async () => {
    setIsRunning(true);
    setResults(null);

    const outcomes = [];
    for (const tc of testCases) {
      try {
        const payload = {
          motor_id: 'BENCHMARK_CHALLENGE',
          sampling_rate_hz: tc.fs,
          operating_rpm: tc.rpm,
          poles: 4,
          fault_class: tc.fault_class,
          seed: tc.seed,
        };
        const res = await api.analyzeRecording(payload);
        outcomes.push({
          ...tc,
          success: true,
          diagnostic_run: res.diagnostic_run,
        });
      } catch (err) {
        outcomes.push({
          ...tc,
          success: false,
          error: err.message,
        });
      }
    }

    setResults(outcomes);
    setIsRunning(false);
  };

  const activeResult = results ? results[selectedCaseIdx] : null;

  return (
    <div>
      {/* Intro Card */}
      <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.95), rgba(30, 41, 59, 0.95))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <span className="badge badge-purple">Challenge Lab</span>
              <span className="badge badge-cyan">Speed & Load Invariance</span>
            </div>
            <h2 style={{ fontSize: '1.35rem', color: 'var(--navy-primary)', margin: '0.2rem 0' }}>
              Variable-Condition Generalization & Safety Challenge
            </h2>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', maxWidth: '750px' }}>
              Real-world industrial motors operate across variable speed drives (VFD) and varying loads. This challenge validates that our MCSA pipeline maintains physical discriminability across regimes and enforces safety refusals at physical boundaries.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunChallenge}
            disabled={isRunning}
            style={{ minWidth: '240px' }}
          >
            {isRunning ? 'Evaluating 4 Regimes...' : 'Run Variable-Condition Test →'}
          </button>
        </div>
      </div>

      {/* Regimes Comparison Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {testCases.map((tc, idx) => {
          const res = results ? results[idx] : null;
          const isSelected = selectedCaseIdx === idx;
          const status = res?.diagnostic_run?.diagnostic_status;
          const predClass = res?.diagnostic_run?.predicted_class;

          return (
            <div
              key={tc.id}
              onClick={() => setSelectedCaseIdx(idx)}
              style={{
                background: isSelected ? 'rgba(8, 122, 203, 0.12)' : 'var(--bg-card)',
                border: isSelected ? '1px solid var(--blue-accent)' : '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '1.1rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>
                Regime {idx + 1}
              </div>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--navy-primary)', marginBottom: '0.35rem' }}>
                {tc.title.split(':')[1] || tc.title}
              </h4>
              <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--blue-accent)', fontWeight: 600, marginBottom: '0.65rem' }}>
                {tc.condition}
              </p>

              {res ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Output:</span>
                    <span className={`badge badge-${
                      status === 'DIAGNOSIS_AVAILABLE' ? 'emerald' : status === 'UNSUPPORTED_CONDITION' ? 'rose' : 'amber'
                    }`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                      {status || 'ERROR'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--navy-primary)', fontWeight: 700 }}>
                    {predClass || 'Refused (Safe)'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Conf: {res.diagnostic_run?.model_confidence ? `${(res.diagnostic_run.model_confidence * 100).toFixed(0)}%` : 'N/A'}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  Click 'Run Test' to evaluate
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Regime In-Depth Inspection View */}
      {activeResult && activeResult.diagnostic_run ? (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span className="mono" style={{ fontSize: '0.8rem', color: '#38bdf8' }}>{activeResult.condition}</span>
                <span className={`badge badge-${
                  activeResult.diagnostic_run.diagnostic_status === 'DIAGNOSIS_AVAILABLE' ? 'emerald' : 'rose'
                }`}>
                  {activeResult.diagnostic_run.diagnostic_status}
                </span>
              </div>
              <h3 className="card-title">{activeResult.title}</h3>
              <p className="card-desc">{activeResult.note}</p>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onSelectRun(activeResult.diagnostic_run)}
            >
              Open in Diagnostic Lab →
            </button>
          </div>

          {/* Canvas Spectrum Preview */}
          {activeResult.diagnostic_run.plotting_data && (
            <div style={{ marginBottom: '1.25rem' }}>
              <SignalCanvas
                mode="spectrum"
                data={activeResult.diagnostic_run.plotting_data}
                height={220}
                title={`MCSA Spectrum under ${activeResult.condition} — Fundamental & Sideband Tracking`}
                units="dB"
              />
            </div>
          )}

          {/* Physical Evidence Verification */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', background: '#0a0e17', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Fundamental Carrier (f_fund):</span>
              <p className="mono" style={{ color: 'var(--blue-accent)', fontWeight: 600 }}>
                {activeResult.diagnostic_run.provenance?.fundamental_freq_hz?.toFixed(2) || '50.00'} Hz
              </p>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Motor Slip (s):</span>
              <p className="mono" style={{ color: 'var(--navy-primary)', fontWeight: 600 }}>
                {activeResult.diagnostic_run.provenance?.motor_slip?.toFixed(4) || 'N/A'}
              </p>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Diagnostic Assessment:</span>
              <p style={{ color: 'var(--emerald-success)', fontWeight: 600, fontSize: '0.85rem' }}>
                {activeResult.diagnostic_run.status_explanation}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Comparative Evaluation Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Comparative Regimes Protocol Table</h3>
            <p className="card-desc">Clear separation of ground-truth physics vs automated model behavior</p>
          </div>
          <span className="badge badge-cyan">4 Test Protocols</span>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Regime & Condition</th>
                <th>Ground Truth Fault</th>
                <th>Expected Physical Behavior</th>
                <th>Model Prediction</th>
                <th>Trust Gate Outcome</th>
              </tr>
            </thead>
            <tbody>
              {testCases.map((tc, idx) => {
                const res = results ? results[idx] : null;
                return (
                  <tr key={tc.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--navy-primary)' }}>{tc.title}</div>
                      <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--blue-accent)', fontWeight: 600 }}>{tc.condition}</div>
                    </td>
                    <td>
                      <span className="badge badge-muted">{tc.ground_truth}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {tc.expected_outcome}
                    </td>
                    <td>
                      {res ? (
                        <span style={{ fontWeight: 700, color: 'var(--navy-primary)' }}>
                          {res.diagnostic_run?.predicted_class || 'Refused'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>Pending Run</span>
                      )}
                    </td>
                    <td>
                      {res ? (
                        <span className={`badge badge-${
                          res.diagnostic_run?.diagnostic_status === 'DIAGNOSIS_AVAILABLE' ? 'emerald' : 'rose'
                        }`}>
                          {res.diagnostic_run?.diagnostic_status}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

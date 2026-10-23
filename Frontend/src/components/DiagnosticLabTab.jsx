import React, { useState } from 'react';
import SignalCanvas from './SignalCanvas';
import EvidenceToActionFlow from './EvidenceToActionFlow';

export default function DiagnosticLabTab({
  selectedRun,
  linkedWorkOrder,
  onNavigateToDiagnose,
  onOpenWorkOrder,
}) {
  const [activeSignalView, setActiveSignalView] = useState('both'); // 'both' | 'spectrum' | 'waveform'

  if (!selectedRun) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔬</div>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#fff' }}>
          Motor Health Digital Diagnostic Lab
        </h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto 1.5rem' }}>
          No diagnostic recording is currently loaded. Select a historical run from the Overview or launch a new motor diagnosis.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNavigateToDiagnose}
        >
          Launch Motor Diagnosis →
        </button>
      </div>
    );
  }

  const status = selectedRun.diagnostic_status || 'UNKNOWN';
  const predictedClass = selectedRun.predicted_class || 'None';
  const confidence = selectedRun.model_confidence ? (selectedRun.model_confidence * 100).toFixed(1) : 'N/A';
  const healthIndex = typeof selectedRun.health_index === 'number' ? selectedRun.health_index.toFixed(0) : 'N/A';

  const plottingData = selectedRun.plotting_data || null;
  const spectralRegions = selectedRun.spectral_regions || [];
  const keyFeatures = selectedRun.key_features || {};
  const rawScores = selectedRun.raw_class_scores || {};
  const calProbs = selectedRun.calibrated_probabilities || {};
  const severity = selectedRun.severity || {};
  const triggers = selectedRun.human_review_triggers || [];
  const warnings = selectedRun.diagnostic_warnings || [];

  return (
    <div>
      {/* Run Header Diagnostic Summary Card */}
      <div className="card" style={{ marginBottom: '1.5rem', borderLeft: `4px solid ${
        status === 'DIAGNOSIS_AVAILABLE' ? '#10b981' : status === 'REVIEW_REQUIRED' ? '#f59e0b' : '#f43f5e'
      }` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
              <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                RUN ID: {selectedRun.id}
              </span>
              <span className={`badge badge-${
                status === 'DIAGNOSIS_AVAILABLE' ? 'emerald' : status === 'REVIEW_REQUIRED' ? 'amber' : 'rose'
              }`}>
                {status}
              </span>
              {selectedRun.fault_code && (
                <span className="badge badge-purple">{selectedRun.fault_code}</span>
              )}
            </div>
            <h1 style={{ fontSize: '1.5rem', margin: '0.2rem 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {selectedRun.motor_tag} — {selectedRun.motor_name}
            </h1>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
              Analyzed at {new Date(selectedRun.timestamp).toLocaleString()} • Model: <span className="mono">{selectedRun.model_version || 'mcsa_rf_v1.0.0'}</span>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Model Confidence
              </span>
              <div className="stat-value" style={{ color: '#38bdf8' }}>
                {confidence}%
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                T=0.53 Calibrated
              </span>
            </div>

            <div style={{ textAlign: 'right', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Health Index
              </span>
              <div className="stat-value" style={{ color: healthIndex > 70 ? '#34d399' : '#fbbf24' }}>
                {healthIndex}%
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                0-100 Physical Scale
              </span>
            </div>
          </div>
        </div>

        {/* Status Explanation Banner */}
        {selectedRun.status_explanation && (
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginTop: '1rem',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.85rem',
            color: 'var(--text-main)',
          }}>
            <strong style={{ color: '#fff' }}>Diagnostic Status Assessment:</strong> {selectedRun.status_explanation}
          </div>
        )}

        {/* Human Review Triggers (if any) */}
        {triggers.length > 0 && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
            marginTop: '0.75rem',
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Human Review Policy Triggers ({triggers.length}):
            </span>
            <ul style={{ paddingLeft: '1.2rem', marginTop: '0.35rem', fontSize: '0.8rem', color: '#fed7aa' }}>
              {triggers.map((t, idx) => (
                <li key={idx}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <div style={{
            background: 'rgba(236, 72, 153, 0.1)',
            border: '1px solid rgba(236, 72, 153, 0.3)',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
            marginTop: '0.75rem',
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f472b6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Operational Warnings ({warnings.length}):
            </span>
            <ul style={{ paddingLeft: '1.2rem', marginTop: '0.35rem', fontSize: '0.8rem', color: '#fbcfe8' }}>
              {warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Interactive Signal Views (HTML5 Canvas) */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Interactive Signal & Spectral Signature</h3>
            <p className="card-desc">Current waveform $i(t)$ and high-resolution Fourier spectrum with harmonic markers</p>
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
              className={`btn btn-sm ${activeSignalView === 'spectrum' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveSignalView('spectrum')}
            >
              Spectrum (FFT)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeSignalView === 'waveform' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveSignalView('waveform')}
            >
              Waveform i(t)
            </button>
          </div>
        </div>

        {plottingData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {(activeSignalView === 'both' || activeSignalView === 'waveform') && (
              <SignalCanvas
                mode="time"
                data={plottingData}
                height={220}
                title="Stator Current Waveform i(t) [Amperes vs Time]"
                units="A"
              />
            )}
            {(activeSignalView === 'both' || activeSignalView === 'spectrum') && (
              <SignalCanvas
                mode="spectrum"
                data={plottingData}
                height={260}
                title="MCSA Power Spectrum (0 to 160 Hz) — Sideband Markers (1±2s)fs & 2fs Harmonics"
                units="dB"
              />
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No waveform plotting arrays preserved for this record.
          </div>
        )}
      </div>

      {/* Model Class Scores & Probability Calibration */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        {/* Class Scores & Calibrated Probabilities */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Model Probabilities & Calibration</h3>
              <p className="card-desc">Comparing raw decision tree votes vs temperature-calibrated posteriors</p>
            </div>
            <span className="badge badge-purple">T = 0.53</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {['HEALTHY', 'BROKEN_ROTOR_BAR', 'BEARING_FAULT', 'MISALIGNMENT'].map((cls) => {
              const raw = rawScores[cls] !== undefined ? (rawScores[cls] * 100).toFixed(1) : '0.0';
              const cal = calProbs[cls] !== undefined ? (calProbs[cls] * 100).toFixed(1) : '0.0';
              const isTop = predictedClass === cls;

              return (
                <div key={cls} style={{ background: isTop ? 'rgba(6, 182, 212, 0.08)' : 'transparent', padding: isTop ? '0.5rem 0.75rem' : '0.2rem 0', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: isTop ? 700 : 500, color: isTop ? '#38bdf8' : 'var(--text-main)', fontSize: '0.85rem' }}>
                      {cls} {isTop && '★ (Top)'}
                    </span>
                    <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Calibrated: <strong style={{ color: '#fff' }}>{cal}%</strong> (Raw: {raw}%)
                    </span>
                  </div>
                  {/* Progress bar comparison */}
                  <div style={{ width: '100%', height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, parseFloat(cal))}%`,
                        height: '100%',
                        background: isTop ? 'linear-gradient(90deg, #06b6d4, #a855f7)' : '#475569',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ marginTop: '1.25rem', fontSize: '0.78rem', color: 'var(--text-dim)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
            Note: Raw class scores represent uncalibrated tree vote fractions. Production inference applies temperature scaling (T=0.53) to align posterior probabilities with empirical precision.
          </p>
        </div>

        {/* Defensible Severity & Action Recommendation */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Defensible Severity Standard</h3>
              <p className="card-desc">Preserving industry standard terminology and measurement basis</p>
            </div>
            <span className="badge badge-amber">{severity.standard_reference || 'ISO/EPRI'}</span>
          </div>

          <div style={{ background: '#0a0e17', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Severity Level Assessment:
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
              {severity.severity_level || severity.status || 'UNSUPPORTED_SEVERITY'}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.35rem' }}>
              <strong>Measurement Basis:</strong> {severity.measurement_basis || 'N/A'}
            </p>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Recommended Engineering Action:
            </span>
            <p style={{ fontSize: '0.85rem', color: '#e2e8f0', marginTop: '0.25rem', lineHeight: 1.5 }}>
              {selectedRun.recommended_action || 'Continue routine condition monitoring.'}
            </p>
          </div>

          {severity.notes && (
            <div style={{ marginTop: '1rem', padding: '0.65rem 0.85rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Policy Note: </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{severity.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Spectral Regions of Interest & Key Physical Features */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        {/* Spectral Regions Table */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Spectral Regions of Interest</h3>
              <p className="card-desc">Dominant line frequency harmonics & modulation sidebands</p>
            </div>
            <span className="badge badge-cyan">{spectralRegions.length} Regions</span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Region / Line</th>
                  <th>Center Freq</th>
                  <th>Magnitude</th>
                  <th>Δ dB to Carrier</th>
                </tr>
              </thead>
              <tbody>
                {spectralRegions.map((reg, idx) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.825rem' }}>{reg.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{reg.diagnostic_relevance}</div>
                    </td>
                    <td className="mono" style={{ fontSize: '0.8rem', color: '#38bdf8' }}>
                      {reg.center_frequency_hz} Hz
                    </td>
                    <td className="mono" style={{ fontSize: '0.8rem' }}>
                      {reg.measured_power_db} dB
                    </td>
                    <td className="mono" style={{ fontSize: '0.8rem', fontWeight: 600, color: reg.delta_db_relative_to_fund !== null ? (reg.delta_db_relative_to_fund < 45 ? '#fb7185' : '#34d399') : '#94a3b8' }}>
                      {reg.delta_db_relative_to_fund !== null ? `${reg.delta_db_relative_to_fund.toFixed(1)} dB` : 'Carrier (0.0)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Key Feature Summary Table */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Extracted Signal Features</h3>
              <p className="card-desc">Time-domain statistical & electromagnetic orbital metrics</p>
            </div>
            <span className="badge badge-cyan">{Object.keys(keyFeatures).length} Indicators</span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Value</th>
                  <th>Nominal Range</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(keyFeatures).map(([k, feat]) => (
                  <tr key={k}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.825rem' }}>{feat.feature_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{feat.physical_interpretation}</div>
                    </td>
                    <td className="mono" style={{ fontSize: '0.825rem', fontWeight: 600 }}>
                      {feat.value} {feat.unit !== 'ratio' && feat.unit}
                    </td>
                    <td className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      [{feat.nominal_range?.[0]}, {feat.nominal_range?.[1]}]
                    </td>
                    <td>
                      <span className={`badge badge-${
                        feat.status === 'NOMINAL' ? 'emerald' : feat.status === 'ELEVATED' ? 'amber' : 'rose'
                      }`}>
                        {feat.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Signature Feature: Evidence-to-Action Visual Audit Trail */}
      <EvidenceToActionFlow
        diagnosticRun={selectedRun}
        linkedWorkOrder={linkedWorkOrder}
        onOpenWorkOrder={onOpenWorkOrder}
      />
    </div>
  );
}

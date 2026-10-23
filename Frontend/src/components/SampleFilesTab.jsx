import React, { useState, useEffect } from 'react';
import { api } from '../api';
import ErrorBoundary from './ErrorBoundary';

export default function SampleFilesTab({ onNavigateToDiagnose }) {
  const [samplesList, setSamplesList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSamples() {
      try {
        const res = await api.getSampleFilesList();
        if (res.status === 'SUCCESS' && res.data) {
          setSamplesList(res.data);
        }
      } catch (err) {
        console.warn('Could not load samples list:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSamples();
  }, []);

  return (
    <ErrorBoundary title="Sample Files & Datasets">
      <div>
        {/* Banner */}
        <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(99, 102, 241, 0.08))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ maxWidth: '800px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <span className="badge badge-cyan">Benchmark Dataset Provenance</span>
                <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>4TU • Paderborn • LIAS MCSA-DC</span>
              </div>
              <h1 style={{ fontSize: '1.4rem', color: 'var(--navy-primary)', fontWeight: 700, margin: '0.2rem 0 0.5rem' }}>
                Public Dataset Provenance & Downloadable Sample Current Files
              </h1>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Motor Health AI operates strictly on non-invasive stator current measurements. To facilitate transparent testing and demonstration, four verified 1.0-second current recordings (5,000 samples @ 5,000 Hz) are available below. You can download each file and upload it through the <strong>Diagnose Motor</strong> interface.
              </p>
            </div>

            {onNavigateToDiagnose && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onNavigateToDiagnose}
                style={{ padding: '0.65rem 1.25rem', fontWeight: 600 }}
              >
                Go to Upload & Diagnose →
              </button>
            )}
          </div>
        </div>

        {/* 4 Downloadable Sample Files Grid */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.15rem', color: 'var(--navy-primary)', marginBottom: '1rem' }}>
            Available Benchmark Current Files
          </h2>

          <div className="grid-2" style={{ gap: '1.25rem' }}>
            {samplesList.map((sample) => (
              <div
                key={sample.filename}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: `3px solid ${
                    sample.condition === 'HEALTHY' ? '#10b981' :
                    sample.condition === 'BROKEN_ROTOR_BAR' ? '#f59e0b' :
                    sample.condition === 'BEARING_FAULT' ? '#ec4899' : '#8b5cf6'
                  }`,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--navy-primary)', margin: 0 }}>
                      {sample.label}
                    </h3>
                    <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--blue-accent)', fontWeight: 600 }}>
                      {sample.filename}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '0.75rem' }}>
                    {sample.description}
                  </p>

                  <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--navy-primary)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Provenance & Dataset Source:
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', marginTop: '0.2rem' }}>
                      {sample.provenance}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                  <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    Size: ~105 KB • Format: CSV
                  </span>
                  <a
                    href={api.getSampleDownloadUrl(sample.filename)}
                    download={sample.filename}
                    className="btn btn-primary btn-sm"
                  >
                    📥 Download CSV File
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Technical Data Schema Guidelines */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Supported Upload File Formats</h3>
              <p className="card-desc">Schema specifications for custom user recordings</p>
            </div>
            <span className="badge badge-purple">CSV & JSON Standards</span>
          </div>

          <div className="grid-2" style={{ gap: '1.5rem', marginTop: '1rem' }}>
            <div style={{ background: 'var(--bg-surface-elevated)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: 700, color: 'var(--blue-accent)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                CSV Format 1: Time & Current Columns
              </div>
              <pre className="mono" style={{ fontSize: '0.75rem', color: '#0F172A', background: '#FFFFFF', border: '1px solid var(--border-subtle)', padding: '0.75rem', borderRadius: '6px', overflowX: 'auto' }}>
{`time_s,current_a
0.0000,0.1245
0.0002,1.3521
0.0004,2.5684
0.0006,3.7512
... (minimum 1,000 rows)`}
              </pre>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: 700, color: 'var(--emerald-success)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                CSV Format 2: 3-Phase Stator Waveforms
              </div>
              <pre className="mono" style={{ fontSize: '0.75rem', color: '#0F172A', background: '#FFFFFF', border: '1px solid var(--border-subtle)', padding: '0.75rem', borderRadius: '6px', overflowX: 'auto' }}>
{`time_s,current_a,phase_b_a,phase_c_a
0.0000,14.1000,-7.0500,-7.0500
0.0002,14.0721,-6.8920,-7.1801
0.0004,13.9885,-6.7321,-7.2564
... (minimum 1,000 rows)`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

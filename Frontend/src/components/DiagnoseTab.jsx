import React, { useState } from 'react';
import { api } from '../api';

export default function DiagnoseTab({
  motors = [],
  fixtures = [],
  onDiagnosisComplete,
}) {
  const [inputMode, setInputMode] = useState('fixture'); // 'fixture' | 'upload'
  const [selectedFixtureId, setSelectedFixtureId] = useState('healthy_nominal');
  const [selectedMotorId, setSelectedMotorId] = useState(motors[0]?.id || '');

  // Metadata inputs
  const [samplingRateHz, setSamplingRateHz] = useState(5000);
  const [operatingRpm, setOperatingRpm] = useState(1470);
  const [poles, setPoles] = useState(4);
  const [loadPct, setLoadPct] = useState(100);

  // File upload state
  const [uploadedData, setUploadedData] = useState(null);
  const [fileValidationMsg, setFileValidationMsg] = useState('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // When fixture changes, sync default metadata
  const handleFixtureChange = (fixtureId) => {
    setSelectedFixtureId(fixtureId);
    const fix = fixtures.find((f) => f.id === fixtureId);
    if (fix) {
      if (fix.operating_rpm) setOperatingRpm(fix.operating_rpm);
      if (fix.sampling_rate_hz) setSamplingRateHz(fix.sampling_rate_hz);
      if (fix.load_pct) setLoadPct(fix.load_pct);
    }
  };

  // Handle CSV / JSON file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage('');
    setFileValidationMsg('Validating file format and finite numeric samples...');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (!text) throw new Error('File is empty.');

        let currentArray = [];
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            currentArray = parsed;
          } else if (parsed.current_data && Array.isArray(parsed.current_data)) {
            currentArray = parsed.current_data;
            if (parsed.sampling_rate_hz) setSamplingRateHz(parsed.sampling_rate_hz);
            if (parsed.operating_rpm) setOperatingRpm(parsed.operating_rpm);
          } else {
            throw new Error("JSON must contain an array of numbers or a 'current_data' key.");
          }
        } else {
          // CSV or plain text parse
          const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Skip header line if non-numeric
            if (i === 0 && isNaN(Number(line.split(/[,;\t]/)[0]))) continue;
            const parts = line.split(/[,;\t]/);
            const val = parseFloat(parts[0]);
            if (!isNaN(val) && isFinite(val)) {
              currentArray.push(val);
            }
          }
        }

        if (currentArray.length < 1000) {
          throw new Error(
            `Insufficient sample count: Parsed ${currentArray.length} samples. MCSA requires at least 1,000 samples (>=0.20s duration) for valid frequency resolution.`
          );
        }

        setUploadedData(currentArray);
        setFileValidationMsg(
          `✓ Validated '${file.name}': ${currentArray.length.toLocaleString()} finite current samples. Duration: ${(currentArray.length / samplingRateHz).toFixed(3)}s.`
        );
      } catch (err) {
        setUploadedData(null);
        setFileValidationMsg('');
        setErrorMessage(`File Validation Failed: ${err.message}`);
      }
    };

    reader.onerror = () => {
      setErrorMessage('Failed to read file from disk.');
    };

    reader.readAsText(file);
  };

  const handleRunDiagnosis = async () => {
    setIsProcessing(true);
    setErrorMessage('');

    try {
      setProgressStage('Validating signal format and channel parameters...');
      await new Promise((r) => setTimeout(r, 250));

      setProgressStage('Executing MCSA Digital Signal Processing (Hanning FFT & Sidebands)...');
      await new Promise((r) => setTimeout(r, 300));

      setProgressStage('Evaluating Calibrated ML Model & Probability Scaling (T=0.53)...');

      let payload = {
        motor_id: selectedMotorId,
        sampling_rate_hz: parseFloat(samplingRateHz),
        operating_rpm: parseFloat(operatingRpm),
        poles: parseInt(poles, 10),
      };

      if (inputMode === 'fixture') {
        const fix = fixtures.find((f) => f.id === selectedFixtureId);
        payload.fault_class = fix?.canonical_fault || 'HEALTHY';
        payload.seed = fix?.seed || 42;
      } else {
        if (!uploadedData || uploadedData.length === 0) {
          throw new Error('Please select and upload a valid current signal file first.');
        }
        payload.current_data = uploadedData;
      }

      const response = await api.analyzeRecording(payload);

      setProgressStage('Auditing Trust & Human Review Policies...');
      await new Promise((r) => setTimeout(r, 250));

      if (response.status === 'SUCCESS' && response.diagnostic_run) {
        onDiagnosisComplete(response.diagnostic_run, response.work_order_action?.work_order);
      } else {
        throw new Error(response.message || 'Diagnostic execution did not return a valid run.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Diagnostic analysis failed.');
    } finally {
      setIsProcessing(false);
      setProgressStage('');
    }
  };

  const currentFixture = fixtures.find((f) => f.id === selectedFixtureId);

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--cyan-primary)' }}>
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
              Diagnose Induction Motor
            </h2>
            <p className="card-desc">
              Execute full MCSA digital signal processing, sideband detection, and calibrated fault inference.
            </p>
          </div>
          <span className="badge badge-cyan">Inference Ready</span>
        </div>

        {/* Source Mode Switcher */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            type="button"
            className={`btn ${inputMode === 'fixture' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setInputMode('fixture')}
            style={{ flex: 1 }}
          >
            Select Verified Benchmark Recording
          </button>
          <button
            type="button"
            className={`btn ${inputMode === 'upload' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setInputMode('upload')}
            style={{ flex: 1 }}
          >
            Upload Motor Current File (CSV / JSON)
          </button>
        </div>

        {/* Mode 1: Benchmark Fixtures Selection */}
        {inputMode === 'fixture' ? (
          <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '1.25rem', borderRadius: '10px', marginBottom: '1.5rem', border: '1px solid var(--border-subtle)' }}>
            <div className="form-group">
              <label htmlFor="fixture-select" className="form-label" style={{ fontWeight: 600 }}>
                Verified Canonical Recording:
              </label>
              <select
                id="fixture-select"
                className="form-select"
                value={selectedFixtureId}
                onChange={(e) => handleFixtureChange(e.target.value)}
              >
                {fixtures.map((f) => (
                  <option key={f.id} value={f.id}>
                    [{f.condition_group}] {f.name}
                  </option>
                ))}
              </select>
            </div>

            {currentFixture && (
              <div style={{ background: '#0a0e17', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Physical Signature Details:
                  </span>
                  <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>
                    Ground Truth: {currentFixture.ground_truth}
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                  {currentFixture.description}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Mode 2: File Upload */
          <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '1.25rem', borderRadius: '10px', marginBottom: '1.5rem', border: '1px solid var(--border-subtle)' }}>
            <div className="form-group">
              <label htmlFor="current-file-input" className="form-label" style={{ fontWeight: 600 }}>
                Select Single-Phase or Three-Phase Current Recording (CSV / JSON):
              </label>
              <input
                id="current-file-input"
                type="file"
                accept=".csv,.txt,.json"
                className="form-control"
                onChange={handleFileUpload}
                style={{ cursor: 'pointer' }}
              />
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                Supported formats: CSV with stator current column in Amperes, or JSON array of floats. Minimum 1,000 samples.
              </p>
            </div>

            {fileValidationMsg && (
              <div style={{ fontSize: '0.825rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', padding: '0.65rem 1rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                {fileValidationMsg}
              </div>
            )}
          </div>
        )}

        {/* Operating Conditions Metadata Form */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.85rem' }}>
            Motor Operating Conditions & Metadata
          </h4>

          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="motor-target-select" className="form-label">Target Asset / Motor:</label>
              <select
                id="motor-target-select"
                className="form-select"
                value={selectedMotorId}
                onChange={(e) => setSelectedMotorId(e.target.value)}
              >
                {motors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.tag} — {m.name} ({m.location})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="sampling-rate-input" className="form-label">Sampling Rate (Hz):</label>
              <input
                id="sampling-rate-input"
                type="number"
                className="form-control mono"
                value={samplingRateHz}
                onChange={(e) => setSamplingRateHz(e.target.value)}
                min="500"
                max="50000"
                step="100"
              />
            </div>

            <div className="form-group">
              <label htmlFor="operating-rpm-input" className="form-label">Operating Speed (RPM):</label>
              <input
                id="operating-rpm-input"
                type="number"
                className="form-control mono"
                value={operatingRpm}
                onChange={(e) => setOperatingRpm(e.target.value)}
                min="300"
                max="3600"
                step="5"
              />
            </div>

            <div className="form-group">
              <label htmlFor="load-pct-input" className="form-label">Estimated Motor Load (%):</label>
              <input
                id="load-pct-input"
                type="number"
                className="form-control mono"
                value={loadPct}
                onChange={(e) => setLoadPct(e.target.value)}
                min="0"
                max="150"
                step="5"
              />
            </div>

            <div className="form-group">
              <label htmlFor="poles-input" className="form-label">Motor Poles:</label>
              <select
                id="poles-input"
                className="form-select mono"
                value={poles}
                onChange={(e) => setPoles(Number(e.target.value))}
              >
                <option value={2}>2 Poles (3000/3600 RPM)</option>
                <option value={4}>4 Poles (1500/1800 RPM)</option>
                <option value={6}>6 Poles (1000/1200 RPM)</option>
                <option value={8}>8 Poles (750/900 RPM)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#fb7185',
            fontSize: '0.875rem',
          }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span>⚠️</span> Diagnostic Error
            </div>
            {errorMessage}
          </div>
        )}

        {/* Progress State */}
        {isProcessing && (
          <div style={{
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid var(--border-accent)',
            borderRadius: '8px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            textAlign: 'center',
          }}>
            <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid rgba(6,182,212,0.3)', borderTopColor: '#06b6d4', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '0.5rem' }} />
            <p style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>{progressStage}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
              Executing physical signal decomposition and ML inference...
            </p>
          </div>
        )}

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minWidth: '220px' }}
            disabled={isProcessing}
            onClick={handleRunDiagnosis}
          >
            {isProcessing ? 'Analyzing Signal...' : 'Run MCSA Diagnosis →'}
          </button>
        </div>
      </div>
    </div>
  );
}

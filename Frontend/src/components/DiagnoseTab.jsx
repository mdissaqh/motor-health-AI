import React, { useState, useEffect } from 'react';
import { api } from '../api';
import ErrorBoundary from './ErrorBoundary';

export default function DiagnoseTab({
  motors = [],
  onDiagnosisComplete,
}) {
  // Target Motor Selection (Strictly the 4 required assets)
  const defaultAssetTag = 'PUMP-CW-01';
  const [selectedMotorTag, setSelectedMotorTag] = useState(defaultAssetTag);
  const [excelSpecsData, setExcelSpecsData] = useState(null);
  const [excelProvenance, setExcelProvenance] = useState(null);

  // Operating condition fields
  const [samplingRateHz, setSamplingRateHz] = useState(5000);
  const [operatingRpm, setOperatingRpm] = useState(1470);
  const [loadPct, setLoadPct] = useState(85);
  const [poles, setPoles] = useState(4);

  // File Upload State
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedCurrentData, setUploadedCurrentData] = useState(null);
  const [fileValidationStats, setFileValidationStats] = useState(null);
  const [fileValidationMsg, setFileValidationMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Processing & Error State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Sample files metadata
  const sampleFiles = [
    {
      filename: 'healthy_motor_sample.csv',
      label: 'Healthy Motor',
      subtitle: 'Baseline 50 Hz condition (no faults)',
      color: '#10b981',
      badge: 'Normal Baseline',
    },
    {
      filename: 'bearing_fault_sample.csv',
      label: 'Bearing Fault',
      subtitle: 'Outer race BPFO impact modulations',
      color: '#ec4899',
      badge: 'Race Defect',
    },
    {
      filename: 'broken_rotor_bar_sample.csv',
      label: 'Broken Rotor Bar',
      subtitle: 'Characteristic (1±2s)fs sidebands (<40 dB)',
      color: '#f59e0b',
      badge: 'Cage Damage',
    },
    {
      filename: 'misalignment_sample.csv',
      label: 'Shaft Misalignment',
      subtitle: '2x line frequency harmonic & unbalance',
      color: '#8b5cf6',
      badge: 'Mechanical Offset',
    },
  ];

  // Fetch Excel workbook specifications on mount
  useEffect(() => {
    let ignore = false;
    async function loadExcelSpecs() {
      try {
        const res = await api.getExcelMotorSpecs();
        if (!ignore && res.status === 'SUCCESS' && res.data) {
          setExcelSpecsData(res.data);
          syncFormWithExcel(defaultAssetTag, res.data);
        }
      } catch (err) {
        console.warn('[DiagnoseTab] Could not load Excel specs from API:', err.message);
      }
    }
    loadExcelSpecs();
    return () => { ignore = true; };
  }, []);

  // Sync form with selected asset's Excel record
  const syncFormWithExcel = (tag, wbData = excelSpecsData) => {
    if (!wbData || !wbData.records) return;
    const match = wbData.records.find(
      (r) => (r.asset_tag || '').toUpperCase() === (tag || '').toUpperCase()
    );

    if (match) {
      if (match.sampling_rate_hz) setSamplingRateHz(match.sampling_rate_hz);
      if (match.operating_speed_rpm) setOperatingRpm(match.operating_speed_rpm);
      if (match.estimated_motor_load_pct) setLoadPct(match.estimated_motor_load_pct);
      if (match.poles) setPoles(match.poles);

      setExcelProvenance({
        source_file: wbData.source_file || 'motor_operating_conditions.xlsx',
        sheet_name: wbData.sheet_name || 'Motor_Operating_Conditions',
        row_number: match.row_index,
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  };

  const handleAssetChange = (tag) => {
    setSelectedMotorTag(tag);
    syncFormWithExcel(tag);
  };

  const handleResetToExcel = () => {
    syncFormWithExcel(selectedMotorTag);
  };

  // Handle CSV / JSON File Parsing
  const processUploadedFile = (file) => {
    if (!file) return;
    setUploadedFile(file);
    setErrorMessage('');
    setFileValidationMsg('Reading and validating file data...');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (!text || text.trim().length === 0) {
          throw new Error('The selected file is completely empty.');
        }

        let parsedArray = [];
        let autoDetectedFs = null;

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            parsedArray = parsed.map(Number);
          } else if (parsed.current_data && Array.isArray(parsed.current_data)) {
            parsedArray = parsed.current_data.map(Number);
            if (parsed.sampling_rate_hz) autoDetectedFs = parsed.sampling_rate_hz;
            if (parsed.operating_rpm) setOperatingRpm(parsed.operating_rpm);
          } else {
            throw new Error("JSON must be an array of numeric samples or contain a 'current_data' array key.");
          }
        } else {
          // CSV / Text parsing
          const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
          if (lines.length === 0) throw new Error('CSV file contains no data rows.');

          // Detect header row
          let startIndex = 0;
          const firstLineParts = lines[0].split(/[,;\t]/).map((p) => p.trim());
          const isFirstLineHeader = isNaN(Number(firstLineParts[0])) || firstLineParts[0].toLowerCase().includes('time') || firstLineParts[0].toLowerCase().includes('current');
          if (isFirstLineHeader) startIndex = 1;

          // Determine current column index: if col 0 is time and col 1 is current
          let currentColIdx = 0;
          if (firstLineParts.length >= 2) {
            // Check if column 0 looks like incremental time (0.000, 0.0002...)
            const testRow = lines[startIndex]?.split(/[,;\t]/);
            if (testRow && testRow.length >= 2) {
              const val0 = parseFloat(testRow[0]);
              const val1 = parseFloat(testRow[1]);
              if (!isNaN(val0) && !isNaN(val1) && val0 >= 0 && val0 < 0.1 && (firstLineParts[0].toLowerCase().includes('time') || firstLineParts[1].toLowerCase().includes('current') || firstLineParts[1].toLowerCase().includes('i_u') || firstLineParts[1].toLowerCase().includes('ia'))) {
                currentColIdx = 1;
              }
            }
          }

          for (let i = startIndex; i < lines.length; i++) {
            const parts = lines[i].split(/[,;\t]/);
            const val = parseFloat(parts[currentColIdx]);
            if (!isNaN(val) && isFinite(val)) {
              parsedArray.push(val);
            }
          }
        }

        if (parsedArray.length === 0) {
          throw new Error('No valid finite numeric current samples could be parsed from the file.');
        }

        if (parsedArray.length < 1000) {
          throw new Error(
            `Insufficient samples: Found ${parsedArray.length} points. MCSA signal processing requires at least 1,000 samples (>=0.20s duration) to achieve required Fourier frequency resolution.`
          );
        }

        if (autoDetectedFs) {
          setSamplingRateHz(autoDetectedFs);
        }

        // Calculate basic signal metrics for verification
        const n = parsedArray.length;
        const mean = parsedArray.reduce((a, b) => a + b, 0) / n;
        const sumSq = parsedArray.reduce((acc, v) => acc + (v - mean) * (v - mean), 0);
        const rms = Math.sqrt(sumSq / n);
        const maxVal = Math.max(...parsedArray);
        const minVal = Math.min(...parsedArray);
        const effectiveFs = autoDetectedFs || samplingRateHz || 5000;
        const durationSec = n / effectiveFs;

        setUploadedCurrentData(parsedArray);
        setFileValidationStats({
          sampleCount: n,
          durationSec: durationSec.toFixed(3),
          rms: rms.toFixed(2),
          peak: Math.max(Math.abs(maxVal), Math.abs(minVal)).toFixed(2),
          samplingRateHz: effectiveFs,
        });

        setFileValidationMsg(
          `✓ File '${file.name}' successfully parsed: ${n.toLocaleString()} finite samples (${durationSec.toFixed(3)}s at ${effectiveFs} Hz). RMS Current: ${rms.toFixed(2)} A.`
        );
      } catch (err) {
        setUploadedCurrentData(null);
        setFileValidationStats(null);
        setFileValidationMsg('');
        setErrorMessage(`File Validation Failed: ${err.message}`);
      }
    };

    reader.onerror = () => {
      setErrorMessage('Failed to read file from disk. Please check file permissions.');
    };

    reader.readAsText(file);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processUploadedFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processUploadedFile(file);
  };

  // Execute Diagnosis using the uploaded file
  const handleRunDiagnosis = async () => {
    if (!uploadedCurrentData || uploadedCurrentData.length === 0) {
      setErrorMessage('Please upload a valid motor current CSV or JSON file before analyzing.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      setProgressStage('1. Checking file structure and finite numeric samples...');
      await new Promise((r) => setTimeout(r, 200));

      setProgressStage('2. Studying electrical current waveform and Hanning FFT spectrum...');
      await new Promise((r) => setTimeout(r, 250));

      setProgressStage('3. Evaluating calibrated Random Forest classifier (T=0.53)...');
      await new Promise((r) => setTimeout(r, 250));

      setProgressStage('4. Formulating actionable diagnostic findings and work order...');

      // Match selected tag to motor in registry
      const matchedMotor = motors.find((m) => (m.tag || '').toUpperCase() === selectedMotorTag.toUpperCase());

      const payload = {
        motor_id: matchedMotor?.id || selectedMotorTag,
        current_data: uploadedCurrentData,
        sampling_rate_hz: parseFloat(samplingRateHz),
        operating_rpm: parseFloat(operatingRpm),
        poles: parseInt(poles, 10),
        estimated_load_pct: parseFloat(loadPct),
        operator: 'Reliability Engineer',
        source_filename: uploadedFile?.name || 'uploaded_recording.csv',
      };

      const response = await api.analyzeRecording(payload);

      if (response.status === 'SUCCESS' && response.diagnostic_run) {
        const run = response.diagnostic_run;
        const wo = response.work_order_action?.work_order || null;
        if (onDiagnosisComplete) {
          onDiagnosisComplete(run, wo);
        }
      } else {
        throw new Error(response.message || 'Diagnostic analysis failed on server.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'An unexpected analysis error occurred.');
    } finally {
      setIsProcessing(false);
      setProgressStage('');
    }
  };

  return (
    <ErrorBoundary title="Diagnose Motor Interface">
      <div>
        {/* Page Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.45rem', color: 'var(--navy-primary)', fontWeight: 800, margin: 0 }}>
            Diagnose Motor — Upload Motor Current Recording
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.35rem 0 0' }}>
            Non-invasive Motor Current Signature Analysis (MCSA). Upload an electrical current recording (CSV or JSON) to evaluate bearing raceway health, rotor bar cage integrity, and shaft alignment.
          </p>
        </div>

        {/* 1. Downloadable Sample Current Files Section */}
        <div className="card" style={{ marginBottom: '1.5rem', background: '#FFFFFF', border: '1px solid #BFDBFE', boxShadow: '0 2px 8px rgba(7, 59, 120, 0.05)' }}>
          <div className="card-header" style={{ marginBottom: '0.85rem' }}>
            <div>
              <h2 className="card-title" style={{ fontSize: '1.05rem', color: 'var(--navy-primary)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📁</span>
                <span>Downloadable Sample Current Files (Ready for Immediate Testing)</span>
              </h2>
              <p className="card-desc" style={{ color: '#64748B' }}>
                Need a recording to test the system? Download any of these 4 verified CSV current files, then upload it into the dropzone below.
              </p>
            </div>
            <span className="badge badge-cyan" style={{ background: '#EFF6FF', color: '#0284C7', border: '1px solid #BFDBFE', fontWeight: 700 }}>4 Verified Samples</span>
          </div>

          <div className="grid-4" style={{ gap: '0.85rem' }}>
            {sampleFiles.map((s) => (
              <div
                key={s.filename}
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--navy-primary)', fontSize: '0.875rem' }}>{s.label}</span>
                    <span className="badge" style={{ background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}44`, fontSize: '0.68rem', fontWeight: 700 }}>
                      {s.badge}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#64748B', lineHeight: 1.4, margin: 0 }}>
                    {s.subtitle}
                  </p>
                </div>

                <a
                  href={api.getSampleDownloadUrl(s.filename)}
                  download={s.filename}
                  className="btn btn-secondary btn-sm"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    padding: '0.45rem 0.5rem',
                    background: '#FFFFFF',
                    border: '1px solid #087ACB',
                    color: '#087ACB',
                    fontWeight: 600,
                  }}
                >
                  📥 Download {s.filename}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Upload Motor Current File Dropzone */}
        <div className="card" style={{ marginBottom: '1.5rem', background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
          <div className="card-header" style={{ marginBottom: '0.85rem' }}>
            <div>
              <h2 className="card-title" style={{ fontSize: '1.1rem', color: 'var(--navy-primary)', fontWeight: 800 }}>Upload Motor Current File (CSV / JSON)</h2>
              <p className="card-desc" style={{ color: '#64748B' }}>Select or drag & drop a file containing stator current measurements.</p>
            </div>
            <span className="mono" style={{ fontSize: '0.75rem', color: '#64748B' }}>
              Formats: CSV, JSON • Min 1,000 samples
            </span>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: isDragging ? '2px dashed #087ACB' : '2px dashed #CBD5E1',
              background: isDragging ? '#EFF6FF' : '#F8FAFC',
              borderRadius: '10px',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onClick={() => document.getElementById('motor-file-input')?.click()}
          >
            <input
              id="motor-file-input"
              type="file"
              accept=".csv,.json,text/csv,application/json"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
            <div style={{ fontSize: '2.4rem', marginBottom: '0.65rem' }}>⚡</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy-primary)', marginBottom: '0.35rem' }}>
              {uploadedFile ? uploadedFile.name : 'Drag and drop your motor current file here'}
            </div>
            <p style={{ fontSize: '0.825rem', color: '#64748B', maxWidth: '520px', margin: '0 auto 1rem' }}>
              Upload CSV with columns like <code className="mono">time_s,current_a</code> or 3-phase <code className="mono">ia,ib,ic</code>. Or JSON containing a numeric sample array.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ background: '#FFFFFF', border: '1px solid #087ACB', color: '#087ACB', fontWeight: 600 }}
              onClick={(e) => {
                e.stopPropagation();
                document.getElementById('motor-file-input')?.click();
              }}
            >
              Browse Local File...
            </button>
          </div>

          {/* Validation Feedback & Signal Preview */}
          {fileValidationMsg && (
            <div style={{ marginTop: '1rem', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', padding: '0.85rem 1rem' }}>
              <div style={{ fontSize: '0.825rem', color: '#15803D', fontWeight: 700, marginBottom: '0.35rem' }}>
                ✓ {fileValidationMsg}
              </div>
              {fileValidationStats && (
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#334155' }}>
                  <span>Total Samples: <strong className="mono" style={{ color: '#073B78' }}>{fileValidationStats.sampleCount.toLocaleString()}</strong></span>
                  <span>Duration: <strong className="mono" style={{ color: '#073B78' }}>{fileValidationStats.durationSec} s</strong></span>
                  <span>Sampling Rate: <strong className="mono" style={{ color: '#087ACB' }}>{fileValidationStats.samplingRateHz} Hz</strong></span>
                  <span>RMS Current: <strong className="mono" style={{ color: '#073B78' }}>{fileValidationStats.rms} A</strong></span>
                  <span>Peak Current: <strong className="mono" style={{ color: '#073B78' }}>{fileValidationStats.peak} A</strong></span>
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <div style={{ marginTop: '1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '0.85rem 1rem', color: '#DC2626', fontSize: '0.825rem', fontWeight: 600 }}>
              ⚠️ {errorMessage}
            </div>
          )}
        </div>

        {/* 3. Target Asset & Excel-Initialized Operating Conditions */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header" style={{ marginBottom: '1rem' }}>
            <div>
              <h2 className="card-title" style={{ fontSize: '1.1rem' }}>Target Asset & Operating Conditions</h2>
              <p className="card-desc">
                Select target motor. Operating parameters are automatically initialized from the verified Excel workbook.
              </p>
            </div>
            {excelProvenance && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
                  ✓ Initialized from Excel: {excelProvenance.source_file} [Row {excelProvenance.row_number}]
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleResetToExcel}
                  style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                  title="Reset form values to original Excel defaults"
                >
                  Reset Defaults
                </button>
              </div>
            )}
          </div>

          {/* Target Asset Dropdown (Strict 4 choices) */}
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600, color: 'var(--navy-primary)' }}>
              Which motor is this recording from?
            </label>
            <select
              className="form-select"
              value={selectedMotorTag}
              onChange={(e) => handleAssetChange(e.target.value)}
              style={{ fontSize: '0.875rem', padding: '0.65rem 0.85rem' }}
            >
              <option value="PUMP-CW-01">
                PUMP-CW-01 — Cooling Water Circulation Pump Motor (Pump House Bay 1)
              </option>
              <option value="FAN-ID-02">
                FAN-ID-02 — Induced Draft Boiler Exhaust Fan Motor (Boiler House Level 3)
              </option>
              <option value="COMP-AIR-01">
                COMP-AIR-01 — Instrument Air Screw Compressor Motor (Compressor Utility Room)
              </option>
              <option value="CONV-FEED-03">
                CONV-FEED-03 — Coal Conveyor Overland Drive Motor (Conveyor Transfer Tower B)
              </option>
            </select>
            <span className="field-hint">
              Associates diagnostic findings and generated maintenance work orders directly to this physical asset.
            </span>
          </div>

          {/* 4 Operating Condition Fields */}
          <div className="grid-2" style={{ gap: '1rem' }}>
            {/* Field A: Sampling Rate */}
            <div className="form-group">
              <label className="form-label">
                How was the current recorded? (Sampling Rate)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="number"
                  className="form-control"
                  value={samplingRateHz}
                  onChange={(e) => setSamplingRateHz(e.target.value)}
                  min="500"
                  max="100000"
                />
                <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', minWidth: '35px' }}>Hz</span>
              </div>
              <span className="field-hint">
                Technical term: Sampling frequency (Hz). Number of electrical measurements taken every second.
              </span>
            </div>

            {/* Field B: Operating Speed */}
            <div className="form-group">
              <label className="form-label">
                How fast was the motor running? (Operating Speed)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="number"
                  className="form-control"
                  value={operatingRpm}
                  onChange={(e) => setOperatingRpm(e.target.value)}
                  min="300"
                  max="4000"
                />
                <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', minWidth: '35px' }}>RPM</span>
              </div>
              <span className="field-hint">
                Actual measured shaft speed during the recording. Note: Induction slip causes speed to be slightly below synchronous speed.
              </span>
            </div>

            {/* Field C: Motor Load */}
            <div className="form-group">
              <label className="form-label">
                How heavily was the motor working? (Load %)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="number"
                  className="form-control"
                  value={loadPct}
                  onChange={(e) => setLoadPct(e.target.value)}
                  min="10"
                  max="150"
                />
                <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', minWidth: '35px' }}>%</span>
              </div>
              <span className="field-hint">
                Estimated percentage of rated motor load during recording (e.g. 85%).
              </span>
            </div>

            {/* Field D: Motor Poles */}
            <div className="form-group">
              <label className="form-label">
                Motor design: number of poles
              </label>
              <select
                className="form-select"
                value={poles}
                onChange={(e) => setPoles(Number(e.target.value))}
              >
                <option value={2}>2 poles — 3000 RPM @ 50 Hz / 3600 RPM @ 60 Hz sync</option>
                <option value={4}>4 poles — 1500 RPM @ 50 Hz / 1800 RPM @ 60 Hz sync</option>
                <option value={6}>6 poles — 1000 RPM @ 50 Hz / 1200 RPM @ 60 Hz sync</option>
                <option value={8}>8 poles — 750 RPM @ 50 Hz / 900 RPM @ 60 Hz sync</option>
              </select>
              <span className="field-hint">
                Electromagnetic pole pairs determine expected synchronous rotating speed.
              </span>
            </div>
          </div>
        </div>

        {/* 4. Action Banner & Run Button */}
        <div
          className="card"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.12), rgba(16, 185, 129, 0.12))',
            border: '1px solid var(--border-accent)',
          }}
        >
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy-primary)' }}>
              Ready to Execute MCSA Diagnostic Analysis
            </div>
            <p style={{ fontSize: '0.825rem', color: '#475569', margin: '0.2rem 0 0' }}>
              Signal will be processed through deterministic Hanning FFT spectral extraction and calibrated Random Forest inference.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunDiagnosis}
            disabled={isProcessing || !uploadedCurrentData}
            style={{ padding: '0.75rem 2rem', fontSize: '0.95rem', fontWeight: 700 }}
          >
            {isProcessing ? 'Analyzing Recording...' : 'Analyse Motor Recording →'}
          </button>
        </div>

        {/* Processing Progress Overlay */}
        {isProcessing && (
          <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span className="spinner" style={{ width: '18px', height: '18px' }} />
              <strong style={{ color: '#38bdf8', fontSize: '0.85rem' }}>{progressStage}</strong>
            </div>
            <div style={{ width: '100%', height: '4px', background: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #06b6d4, #a855f7)',
                  animation: 'pulse 1.2s infinite',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

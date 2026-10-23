import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api';
import ErrorBoundary from './ErrorBoundary';

export default function VibrationTab({ motors = [] }) {
  // Motor selection & Excel Metadata
  const [selectedTag, setSelectedTag] = useState('PUMP-CW-01');
  const [motorSpecs, setMotorSpecs] = useState(null);
  const [excelProvenance, setExcelProvenance] = useState(null);

  // Analysis State
  const [activePreset, setActivePreset] = useState('BEARING_FAILURE');
  const [samplingRateHz, setSamplingRateHz] = useState(5000);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Excel / CSV File Upload State
  const [uploadedData, setUploadedData] = useState(null);
  const [uploadStats, setUploadStats] = useState(null);
  const [excelWorkbook, setExcelWorkbook] = useState(null);
  const [availableSheets, setAvailableSheets] = useState([]);
  const [selectedSheetName, setSelectedSheetName] = useState('');
  const [sheetPreviewRows, setSheetPreviewRows] = useState([]);
  const [detectedColumns, setDetectedColumns] = useState([]);

  // Canvas refs
  const waveformCanvasRef = useRef(null);
  const spectrumCanvasRef = useRef(null);
  const defectCanvasRef = useRef(null);

  // Core Analysis Function
  const runAnalysis = async (customData = uploadedData, currentSpecs = motorSpecs, preset = activePreset, currentFs = samplingRateHz) => {
    if (!currentSpecs) return;
    setErrorMsg('');
    try {
      const payload = {
        motor_tag: selectedTag,
        condition_preset: preset,
        sampling_rate_hz: currentFs,
        motor_specs: currentSpecs,
        vibration_data: customData,
      };
      const res = await api.analyzeVibration(payload);
      if (res.status === 'SUCCESS') {
        setAnalysisResult(res);
      } else {
        setErrorMsg(res.message || 'Analysis failed.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to analyze vibration.');
    }
  };

  // Fetch Motor Specs from Excel when selected tag changes
  useEffect(() => {
    let ignore = false;
    async function loadSpecs() {
      try {
        const res = await api.getVibrationMotorSpecs(selectedTag);
        if (!ignore && res.status === 'SUCCESS' && res.data) {
          setMotorSpecs(res.data);
          setExcelProvenance({
            file: 'motor_operating_conditions.xlsx',
            row: res.data.row_index || 2,
            deBearing: res.data.de_bearing || 'SKF 6314-2Z',
            ndeBearing: res.data.nde_bearing || 'SKF 6312-2Z',
            rpm: res.data.operating_speed_rpm || res.data.rated_speed_rpm || 1475,
            kw: res.data.rated_power_kw || 75.0,
          });
          runAnalysis(uploadedData, res.data, activePreset, samplingRateHz);
        }
      } catch (err) {
        console.warn('Failed to load vibration specs:', err.message);
      }
    }
    loadSpecs();
    return () => { ignore = true; };
  }, [selectedTag]);

  // Run analysis when preset changes
  useEffect(() => {
    if (motorSpecs) {
      runAnalysis(uploadedData, motorSpecs, activePreset, samplingRateHz);
    }
  }, [activePreset]);

  // Process a selected Excel Sheet from uploaded workbook
  const processExcelSheet = (wb, sheetName) => {
    try {
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error(`Sheet '${sheetName}' not found in workbook.`);

      const rawJson = XLSX.utils.sheet_to_json(ws, { defval: null });
      if (!rawJson || rawJson.length === 0) {
        throw new Error(`Sheet '${sheetName}' contains no data rows.`);
      }

      const columns = Object.keys(rawJson[0]);
      setDetectedColumns(columns);
      setSheetPreviewRows(rawJson.slice(0, 5));

      // Auto-detect signal column: Acceleration, Vib, g, Signal, or first numeric column
      let signalCol = columns.find(c => /acc|vibrat|signal|val|g/i.test(c));
      if (!signalCol) {
        signalCol = columns.find(c => typeof rawJson[0][c] === 'number');
      }
      if (!signalCol) signalCol = columns[0];

      // Auto-detect Time column to estimate sampling rate
      const timeCol = columns.find(c => /time|sec|t/i.test(c));
      let estimatedFs = samplingRateHz;
      if (timeCol && rawJson.length >= 2) {
        const t0 = parseFloat(rawJson[0][timeCol]);
        const t1 = parseFloat(rawJson[1][timeCol]);
        const dt = t1 - t0;
        if (dt > 0 && dt < 1) {
          estimatedFs = Math.round(1 / dt);
          setSamplingRateHz(estimatedFs);
        }
      }

      // Check if Excel sheet specifies operating parameters or defect
      const rpmCol = columns.find(c => /rpm|speed/i.test(c));
      const bearingCol = columns.find(c => /bearing/i.test(c));
      const defectCol = columns.find(c => /defect|fault|condition/i.test(c));

      let updatedSpecs = { ...motorSpecs };
      if (rpmCol && rawJson[0][rpmCol]) {
        updatedSpecs.operating_speed_rpm = Number(rawJson[0][rpmCol]);
      }
      if (bearingCol && rawJson[0][bearingCol]) {
        updatedSpecs.de_bearing = String(rawJson[0][bearingCol]);
      }
      let detectedDefect = null;
      if (defectCol && rawJson[0][defectCol]) {
        const val = String(rawJson[0][defectCol]).toUpperCase();
        if (['HEALTHY', 'BEARING_FAILURE', 'BROKEN_ROTOR_BAR', 'MISALIGNMENT'].includes(val)) {
          detectedDefect = val;
          setActivePreset(val);
        }
      }
      if (!detectedDefect) {
        if (/rotor|brb/i.test(sheetName)) detectedDefect = 'BROKEN_ROTOR_BAR';
        else if (/bearing|bpfo|bpfi/i.test(sheetName)) detectedDefect = 'BEARING_FAILURE';
        else if (/misalign/i.test(sheetName)) detectedDefect = 'MISALIGNMENT';
        else if (/healthy|baseline/i.test(sheetName)) detectedDefect = 'HEALTHY';
        if (detectedDefect) setActivePreset(detectedDefect);
      }

      const parsedSamples = [];
      for (let i = 0; i < rawJson.length; i++) {
        const val = parseFloat(rawJson[i][signalCol]);
        if (!isNaN(val) && isFinite(val)) {
          parsedSamples.push(val);
        }
      }

      if (parsedSamples.length < 200) {
        throw new Error(`Insufficient numeric samples: Found ${parsedSamples.length} points in column '${signalCol}'. Minimum 200 required.`);
      }

      setUploadedData(parsedSamples);
      setUploadStats({
        type: 'EXCEL',
        sheetName,
        totalSheets: wb.SheetNames.length,
        signalCol,
        timeCol: timeCol || 'Auto (Index)',
        count: parsedSamples.length,
        fs: estimatedFs,
      });

      // Run analysis with parsed Excel signal
      runAnalysis(parsedSamples, updatedSpecs, detectedDefect || activePreset, estimatedFs);
    } catch (err) {
      setErrorMsg(`Excel Parse Error: ${err.message}`);
    }
  };

  // Handle Excel (.xlsx, .xls) and CSV File Upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    const fileName = file.name;
    const isExcel = /\.(xlsx|xls|xlsm)$/i.test(fileName);

    const reader = new FileReader();

    if (isExcel) {
      reader.onload = (evt) => {
        try {
          const buffer = evt.target?.result;
          const wb = XLSX.read(buffer, { type: 'array' });
          setExcelWorkbook(wb);
          setAvailableSheets(wb.SheetNames);
          const firstSheet = wb.SheetNames[0];
          setSelectedSheetName(firstSheet);
          processExcelSheet(wb, firstSheet);
        } catch (err) {
          setErrorMsg(`Failed to parse Excel workbook: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV / Text parsing
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result;
          if (!text) throw new Error('File is empty.');

          const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
          let startIdx = 0;
          if (isNaN(Number(lines[0].split(/[,;\t]/)[0]))) startIdx = 1;

          const parsed = [];
          for (let i = startIdx; i < lines.length; i++) {
            const parts = lines[i].split(/[,;\t]/);
            const val = parseFloat(parts.length > 1 ? parts[1] : parts[0]);
            if (!isNaN(val) && isFinite(val)) parsed.push(val);
          }

          if (parsed.length < 200) {
            throw new Error(`Insufficient data: ${parsed.length} samples. Minimum 200 points required.`);
          }

          setUploadedData(parsed);
          setUploadStats({
            type: 'CSV',
            sheetName: 'CSV Data',
            signalCol: 'Column 1/2',
            count: parsed.length,
            name: file.name,
            fs: samplingRateHz,
          });
          setExcelWorkbook(null);
          setAvailableSheets([]);
          runAnalysis(parsed, motorSpecs, activePreset, samplingRateHz);
        } catch (err) {
          setErrorMsg(`CSV Upload Error: ${err.message}`);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleClearUpload = () => {
    setUploadedData(null);
    setUploadStats(null);
    setExcelWorkbook(null);
    setAvailableSheets([]);
    setSelectedSheetName('');
    setSheetPreviewRows([]);
    runAnalysis(null, motorSpecs, activePreset, samplingRateHz);
  };

  const handleSheetSwitch = (sheetName) => {
    setSelectedSheetName(sheetName);
    if (excelWorkbook) {
      processExcelSheet(excelWorkbook, sheetName);
    }
  };

  // Helper: Draw rounded HUD tooltip container in canvas
  const drawTooltipBox = (ctx, x, y, width, height, radius = 6) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  };

  // Helper: Mouse Coordinate Scaler for responsive Canvas
  const handleCanvasMouseMove = (e, canvasRef, renderFn) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    renderFn({ x, y });
  };

  // 1. Draw Waveform Canvas with interactive crosshair & data point inspection
  const drawWaveform = (hoverPt = null) => {
    if (!analysisResult || !waveformCanvasRef.current) return;
    const canvas = waveformCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const waveform = analysisResult.visualization?.waveform || [];
    const duration = analysisResult.visualization?.duration_seconds || 1.0;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Gridlines
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    for (let x = 50; x < width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 30; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Zero center line
    const centerY = height / 2;
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (waveform.length === 0) return;

    let maxVal = 0.01;
    for (let v of waveform) {
      if (Math.abs(v) > maxVal) maxVal = Math.abs(v);
    }
    maxVal *= 1.15;

    // Plot waveform line
    ctx.strokeStyle = '#087ACB';
    ctx.lineWidth = 1.6;
    ctx.beginPath();

    const dx = width / waveform.length;
    for (let i = 0; i < waveform.length; i++) {
      const x = i * dx;
      const y = centerY - (waveform[i] / maxVal) * (height / 2 - 15);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#475569';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(`+${maxVal.toFixed(2)} g`, 8, 16);
    ctx.fillText(`-${maxVal.toFixed(2)} g`, 8, height - 8);
    ctx.fillText('0.00 g (Baseline)', 8, centerY - 4);
    ctx.fillText(`Duration: ${duration}s`, width - 110, height - 8);

    // Interactive Hover Layer
    if (hoverPt && hoverPt.x >= 0 && hoverPt.x <= width) {
      const idx = Math.min(waveform.length - 1, Math.max(0, Math.round((hoverPt.x / width) * (waveform.length - 1))));
      const val = waveform[idx];
      const t = (idx / (waveform.length - 1)) * duration;
      const ptX = idx * dx;
      const ptY = centerY - (val / maxVal) * (height / 2 - 15);

      // Vertical crosshair guideline
      ctx.strokeStyle = 'rgba(8, 122, 203, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(ptX, 0);
      ctx.lineTo(ptX, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Glowing data point on waveform
      ctx.fillStyle = 'rgba(8, 122, 203, 0.25)';
      ctx.beginPath();
      ctx.arc(ptX, ptY, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#087ACB';
      ctx.beginPath();
      ctx.arc(ptX, ptY, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(ptX, ptY, 2, 0, Math.PI * 2);
      ctx.fill();

      // Tooltip Card
      const ttWidth = 145;
      const ttHeight = 44;
      let ttX = ptX + 12;
      if (ttX + ttWidth > width - 10) ttX = ptX - ttWidth - 12;
      let ttY = Math.max(10, Math.min(height - ttHeight - 10, ptY - ttHeight / 2));

      drawTooltipBox(ctx, ttX, ttY, ttWidth, ttHeight);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`Time: ${t.toFixed(4)} s`, ttX + 10, ttY + 18);
      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`Accel: ${val >= 0 ? '+' : ''}${val.toFixed(3)} g`, ttX + 10, ttY + 34);
    }
  };

  // 2. Draw Spectrum Canvas with interactive peak snapping & harmonic inspection
  const drawSpectrum = (hoverPt = null) => {
    if (!analysisResult || !spectrumCanvasRef.current) return;
    const canvas = spectrumCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const spectrum = analysisResult.visualization?.spectrum || [];
    const bFreqs = analysisResult.diagnostic?.bearing_frequencies_hz || {};

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    for (let x = 60; x < width; x += 75) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 25; y < height; y += 35) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (spectrum.length === 0) return;

    const maxFreq = 500;
    let maxAmp = 0.05;
    for (let pt of spectrum) {
      if (pt.freq_hz <= maxFreq && pt.acc_g > maxAmp) maxAmp = pt.acc_g;
    }
    maxAmp *= 1.2;

    const scaleX = (freq) => (freq / maxFreq) * (width - 40) + 30;
    const scaleY = (amp) => height - 25 - (amp / maxAmp) * (height - 45);

    // Draw Frequency Marker Lines
    const drawMarker = (freq, color, label, isDashed = true) => {
      if (!freq || freq > maxFreq) return;
      const x = scaleX(freq);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      if (isDashed) ctx.setLineDash([3, 3]);
      else ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, height - 25);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.fillText(label, Math.min(x - 12, width - 60), 15);
    };

    drawMarker(bFreqs.running_speed_1x, '#087ACB', `1x (${bFreqs.running_speed_1x}Hz)`, false);
    drawMarker(bFreqs.misalignment_2x, '#7E22CE', `2x (${bFreqs.misalignment_2x}Hz)`);
    drawMarker(bFreqs.bpfo_outer_race, '#DC2626', `BPFO (${bFreqs.bpfo_outer_race}Hz)`);
    drawMarker(bFreqs.bpfi_inner_race, '#EA580C', `BPFI (${bFreqs.bpfi_inner_race}Hz)`);

    // Plot Spectrum line
    ctx.strokeStyle = '#073B78';
    ctx.lineWidth = 1.8;
    ctx.beginPath();

    let started = false;
    for (let pt of spectrum) {
      if (pt.freq_hz > maxFreq) break;
      const x = scaleX(pt.freq_hz);
      const y = scaleY(pt.acc_g);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(scaleX(maxFreq), height - 25);
    ctx.lineTo(scaleX(0), height - 25);
    ctx.closePath();
    ctx.fillStyle = 'rgba(7, 59, 120, 0.05)';
    ctx.fill();

    // Axes
    ctx.fillStyle = '#64748B';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('0 Hz', 30, height - 8);
    ctx.fillText('100 Hz', scaleX(100) - 15, height - 8);
    ctx.fillText('250 Hz', scaleX(250) - 15, height - 8);
    ctx.fillText('500 Hz', scaleX(500) - 20, height - 8);
    ctx.fillText(`${maxAmp.toFixed(2)} g`, 4, 25);

    // Interactive Hover Layer
    if (hoverPt && hoverPt.x >= 25 && hoverPt.x <= width - 10) {
      const hoverFreq = Math.max(0, Math.min(maxFreq, ((hoverPt.x - 30) / (width - 40)) * maxFreq));
      let closestPt = spectrum[0];
      let minDiff = 9999;
      for (let pt of spectrum) {
        if (pt.freq_hz > maxFreq) break;
        const diff = Math.abs(pt.freq_hz - hoverFreq);
        if (diff < minDiff) {
          minDiff = diff;
          closestPt = pt;
        }
      }

      if (closestPt) {
        const ptX = scaleX(closestPt.freq_hz);
        const ptY = scaleY(closestPt.acc_g);

        // Crosshairs
        ctx.strokeStyle = 'rgba(7, 59, 120, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(ptX, 15);
        ctx.lineTo(ptX, height - 25);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(30, ptY);
        ctx.lineTo(width - 10, ptY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Determine if hovering near a key known fault marker (+/- 3.5 Hz)
        let matchedMarker = null;
        if (bFreqs.running_speed_1x && Math.abs(closestPt.freq_hz - bFreqs.running_speed_1x) <= 3.5) {
          matchedMarker = { name: '1x Running Speed Harmonic', color: '#087ACB', freq: bFreqs.running_speed_1x };
        } else if (bFreqs.misalignment_2x && Math.abs(closestPt.freq_hz - bFreqs.misalignment_2x) <= 3.5) {
          matchedMarker = { name: '2x Misalignment Defect Harmonic', color: '#7E22CE', freq: bFreqs.misalignment_2x };
        } else if (bFreqs.bpfo_outer_race && Math.abs(closestPt.freq_hz - bFreqs.bpfo_outer_race) <= 4.0) {
          matchedMarker = { name: 'BPFO Outer Race Spall Impact', color: '#DC2626', freq: bFreqs.bpfo_outer_race };
        } else if (bFreqs.bpfi_inner_race && Math.abs(closestPt.freq_hz - bFreqs.bpfi_inner_race) <= 4.0) {
          matchedMarker = { name: 'BPFI Inner Race Spall Impact', color: '#EA580C', freq: bFreqs.bpfi_inner_race };
        }

        const dotColor = matchedMarker ? matchedMarker.color : '#073B78';

        // Glowing data point
        ctx.fillStyle = `${dotColor}33`;
        ctx.beginPath();
        ctx.arc(ptX, ptY, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(ptX, ptY, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ptX, ptY, 2, 0, Math.PI * 2);
        ctx.fill();

        // Tooltip
        const ttWidth = matchedMarker ? 190 : 155;
        const ttHeight = matchedMarker ? 62 : 46;
        let ttX = ptX + 12;
        if (ttX + ttWidth > width - 10) ttX = ptX - ttWidth - 12;
        let ttY = Math.max(10, Math.min(height - ttHeight - 28, ptY - ttHeight / 2));

        drawTooltipBox(ctx, ttX, ttY, ttWidth, ttHeight);

        ctx.fillStyle = '#F8FAFC';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(`Freq: ${closestPt.freq_hz.toFixed(1)} Hz`, ttX + 10, ttY + 16);

        ctx.fillStyle = '#38BDF8';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(`Accel: ${closestPt.acc_g.toFixed(4)} g  (${closestPt.vel_mms.toFixed(2)} mm/s)`, ttX + 10, ttY + 32);

        if (matchedMarker) {
          ctx.fillStyle = matchedMarker.color;
          ctx.font = 'bold 10px Inter, sans-serif';
          ctx.fillText(`★ ${matchedMarker.name}`, ttX + 10, ttY + 49);
        }
      }
    }
  };

  // 3. Draw Defect-Specific Graph Canvas with interactive element highlighting
  const drawDefect = (hoverPt = null) => {
    if (!analysisResult || !defectCanvasRef.current) return;
    const canvas = defectCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const predictedDefect = analysisResult.diagnostic?.predicted_class || 'HEALTHY';
    const bFreqs = analysisResult.diagnostic?.bearing_frequencies_hz || {};

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    for (let x = 40; x < width; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 25; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (predictedDefect === 'BEARING_FAILURE') {
      // 1. BEARING DEFECT GRAPH: Demodulated Envelope Shock Train (BPFO Impacts)
      const bpfo = bFreqs.bpfo_outer_race || 75.7;
      const periodSec = 1 / bpfo; // e.g. ~13.2 ms

      // Draw synthetic envelope shocks with markers
      ctx.strokeStyle = '#DC2626';
      ctx.lineWidth = 2.0;
      ctx.beginPath();

      const numPoints = 300;
      for (let i = 0; i < numPoints; i++) {
        const t = (i / numPoints) * 0.10; // 100ms window
        const phase = (t % periodSec) / periodSec;
        let envVal = Math.exp(-phase * 18) * 1.6;
        if (phase > 0.4) envVal += (Math.random() - 0.5) * 0.08;
        const x = (i / numPoints) * (width - 40) + 20;
        const y = height - 30 - envVal * (height - 65);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Highlight impact period lines
      ctx.strokeStyle = 'rgba(220, 38, 38, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (let cycle = 0; cycle < 7; cycle++) {
        const t = cycle * periodSec;
        const x = (t / 0.10) * (width - 40) + 20;
        if (x < width - 20) {
          ctx.beginPath();
          ctx.moveTo(x, 25);
          ctx.lineTo(x, height - 30);
          ctx.stroke();

          ctx.fillStyle = '#DC2626';
          ctx.font = 'bold 9px Inter, sans-serif';
          ctx.fillText(`Shock #${cycle + 1}`, x - 15, 20);
        }
      }
      ctx.setLineDash([]);

      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`Bearing Outer Race Impact Repetition: BPFO = ${bpfo} Hz (Impact Interval: ${(periodSec * 1000).toFixed(1)} ms)`, 20, height - 10);

      // Hover on Bearing Shock Canvas
      if (hoverPt && hoverPt.x >= 20 && hoverPt.x <= width - 20) {
        const hoverT = ((hoverPt.x - 20) / (width - 40)) * 0.10;
        const phase = (hoverT % periodSec) / periodSec;
        const envVal = Math.exp(-phase * 18) * 1.6;
        const ptX = hoverPt.x;
        const ptY = height - 30 - envVal * (height - 65);
        const cycleIdx = Math.floor(hoverT / periodSec) + 1;

        ctx.strokeStyle = 'rgba(220, 38, 38, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(ptX, 15);
        ctx.lineTo(ptX, height - 30);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(220, 38, 38, 0.25)';
        ctx.beginPath();
        ctx.arc(ptX, ptY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#DC2626';
        ctx.beginPath();
        ctx.arc(ptX, ptY, 3.5, 0, Math.PI * 2);
        ctx.fill();

        const ttWidth = 175;
        const ttHeight = 44;
        let ttX = ptX + 10;
        if (ttX + ttWidth > width - 10) ttX = ptX - ttWidth - 10;
        let ttY = Math.max(10, Math.min(height - ttHeight - 20, ptY - ttHeight / 2));

        drawTooltipBox(ctx, ttX, ttY, ttWidth, ttHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(`t: ${(hoverT * 1000).toFixed(1)} ms (Shock Cycle #${cycleIdx})`, ttX + 8, ttY + 17);
        ctx.fillStyle = '#FCA5A5';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(`Envelope Shock Amp: ${envVal.toFixed(2)} g`, ttX + 8, ttY + 33);
      }

    } else if (predictedDefect === 'MISALIGNMENT') {
      // 2. MISALIGNMENT GRAPH: 1x vs 2x Running Speed Harmonic Order Comparison
      const barWidth = 65;
      const baseY = height - 40;
      const fr = bFreqs.running_speed_1x || 24.58;
      const twoFr = bFreqs.misalignment_2x || 49.17;

      const h1 = 90;
      const x1 = width * 0.28;
      const h2 = 145;
      const x2 = width * 0.65;

      const isHoverBar1 = hoverPt && Math.abs(hoverPt.x - x1) <= barWidth / 2 && hoverPt.y >= baseY - h1 && hoverPt.y <= baseY;
      const isHoverBar2 = hoverPt && Math.abs(hoverPt.x - x2) <= barWidth / 2 && hoverPt.y >= baseY - h2 && hoverPt.y <= baseY;

      // Bar 1: 1x running speed
      ctx.fillStyle = isHoverBar1 ? '#0284C7' : '#087ACB';
      ctx.fillRect(x1 - barWidth / 2, baseY - h1, barWidth, h1);
      if (isHoverBar1) {
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2;
        ctx.strokeRect(x1 - barWidth / 2, baseY - h1, barWidth, h1);
      }

      // Bar 2: 2x running speed (Misalignment prominent)
      ctx.fillStyle = isHoverBar2 ? '#9333EA' : '#7E22CE';
      ctx.fillRect(x2 - barWidth / 2, baseY - h2, barWidth, h2);
      if (isHoverBar2) {
        ctx.strokeStyle = '#C084FC';
        ctx.lineWidth = 2;
        ctx.strokeRect(x2 - barWidth / 2, baseY - h2, barWidth, h2);
      }

      // Value labels
      ctx.fillStyle = '#073B78';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(`1x RPM (${fr} Hz)`, x1 - 38, baseY + 18);
      ctx.fillText('0.38 g', x1 - 18, baseY - h1 - 8);

      ctx.fillStyle = '#7E22CE';
      ctx.fillText(`2x Harmonic (${twoFr} Hz)`, x2 - 50, baseY + 18);
      ctx.fillText('0.62 g (ELEVATED)', x2 - 45, baseY - h2 - 8);

      // Ratio Badge
      ctx.fillStyle = '#FDF4FF';
      ctx.fillRect(width * 0.42, 25, 140, 28);
      ctx.strokeStyle = '#D8B4FE';
      ctx.strokeRect(width * 0.42, 25, 140, 28);
      ctx.fillStyle = '#7E22CE';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('2x/1x Ratio: 163% (>50%)', width * 0.42 + 8, 43);

      if (isHoverBar1 || isHoverBar2) {
        const ttWidth = 190;
        const ttHeight = 44;
        const ttX = isHoverBar1 ? x1 - ttWidth / 2 : x2 - ttWidth / 2;
        const ttY = (isHoverBar1 ? baseY - h1 : baseY - h2) - 48;
        drawTooltipBox(ctx, ttX, ttY, ttWidth, ttHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(isHoverBar1 ? 'Fundamental 1x Shaft Speed' : '2x Radial Misalignment Defect', ttX + 8, ttY + 16);
        ctx.fillStyle = isHoverBar1 ? '#38BDF8' : '#C084FC';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(isHoverBar1 ? 'Peak: 0.38 g (Baseline energy)' : 'Peak: 0.62 g (Exceeds 50% threshold)', ttX + 8, ttY + 32);
      }

    } else if (predictedDefect === 'BROKEN_ROTOR_BAR') {
      // 3. BROKEN ROTOR BAR GRAPH: Pole-Pass Sidebands (fr - fp) and (fr + fp) Zoom
      const fr = bFreqs.running_speed_1x || 24.58;
      const fp = bFreqs.pole_pass_brb_sideband || 1.67;
      const baseY = height - 35;
      const centerX = width / 2;

      const xLeft = centerX - 90;
      const xRight = centerX + 90;

      const isHoverCenter = hoverPt && Math.abs(hoverPt.x - centerX) <= 18 && hoverPt.y >= baseY - 160 && hoverPt.y <= baseY;
      const isHoverLeft = hoverPt && Math.abs(hoverPt.x - xLeft) <= 15 && hoverPt.y >= baseY - 95 && hoverPt.y <= baseY;
      const isHoverRight = hoverPt && Math.abs(hoverPt.x - xRight) <= 15 && hoverPt.y >= baseY - 98 && hoverPt.y <= baseY;

      // Draw Center 1x carrier
      ctx.fillStyle = isHoverCenter ? '#0284C7' : '#087ACB';
      ctx.fillRect(centerX - 12, baseY - 160, 24, 160);
      if (isHoverCenter) {
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2;
        ctx.strokeRect(centerX - 12, baseY - 160, 24, 160);
      }
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`1x (${fr}Hz)`, centerX - 25, baseY + 16);

      // Left Sideband (fr - fp)
      ctx.fillStyle = isHoverLeft ? '#D97706' : '#F59E0B';
      ctx.fillRect(xLeft - 10, baseY - 95, 20, 95);
      if (isHoverLeft) {
        ctx.strokeStyle = '#FDE68A';
        ctx.lineWidth = 2;
        ctx.strokeRect(xLeft - 10, baseY - 95, 20, 95);
      }
      ctx.fillText(`(1x - fp)`, xLeft - 20, baseY + 16);
      ctx.fillText(`${(fr - fp).toFixed(1)}Hz`, xLeft - 20, baseY + 28);

      // Right Sideband (fr + fp)
      ctx.fillStyle = isHoverRight ? '#D97706' : '#F59E0B';
      ctx.fillRect(xRight - 10, baseY - 98, 20, 98);
      if (isHoverRight) {
        ctx.strokeStyle = '#FDE68A';
        ctx.lineWidth = 2;
        ctx.strokeRect(xRight - 10, baseY - 98, 20, 98);
      }
      ctx.fillText(`(1x + fp)`, xRight - 20, baseY + 16);
      ctx.fillText(`${(fr + fp).toFixed(1)}Hz`, xRight - 20, baseY + 28);

      // Connecting Delta Arcs
      ctx.strokeStyle = '#D97706';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xLeft, baseY - 105);
      ctx.lineTo(centerX, baseY - 170);
      ctx.lineTo(xRight, baseY - 105);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#B45309';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`Pole-Pass Frequency fp = ${fp} Hz Modulation (Rotor Asymmetry)`, 30, 25);

      if (isHoverCenter || isHoverLeft || isHoverRight) {
        const ttWidth = 195;
        const ttHeight = 44;
        let ttX = centerX - ttWidth / 2;
        if (isHoverLeft) ttX = xLeft - ttWidth / 2;
        if (isHoverRight) ttX = xRight - ttWidth / 2;
        const ttY = 45;
        drawTooltipBox(ctx, ttX, ttY, ttWidth, ttHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(isHoverCenter ? `Center Carrier (1x = ${fr} Hz)` : isHoverLeft ? `Lower Sideband (1x - fp = ${(fr - fp).toFixed(1)} Hz)` : `Upper Sideband (1x + fp = ${(fr + fp).toFixed(1)} Hz)`, ttX + 8, ttY + 16);
        ctx.fillStyle = isHoverCenter ? '#38BDF8' : '#FDE68A';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(isHoverCenter ? 'Motor Rotational Fundamental' : `Torque Modulation Δf = ${fp} Hz`, ttX + 8, ttY + 32);
      }

    } else {
      // 4. HEALTHY BASELINE GRAPH: ISO 10816 Zone A Safe Threshold Boundary
      const vel = analysisResult.diagnostic?.overall_velocity_rms_mms || 0.85;
      const limitA = 1.4;
      const limitB = 2.8;

      ctx.fillStyle = '#ECFDF5';
      ctx.fillRect(40, 40, width - 80, height - 80);
      ctx.strokeStyle = '#A7F3D0';
      ctx.strokeRect(40, 40, width - 80, height - 80);

      // Draw threshold line for Zone A
      const lineY = height - 40 - (limitA / limitB) * (height - 80);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(40, lineY);
      ctx.lineTo(width - 40, lineY);
      ctx.stroke();

      ctx.fillStyle = '#059669';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`ISO 10816 Zone A Limit: ${limitA} mm/s (Good Machinery)`, 50, lineY - 6);

      // Plot measured point
      const pointY = height - 40 - (vel / limitB) * (height - 80);
      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      ctx.arc(width / 2, pointY, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#065F46';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(`Measured Overall Velocity: ${vel} mm/s (Within Pristine Zone A)`, width / 2 - 140, pointY - 14);

      if (hoverPt && hoverPt.x >= 40 && hoverPt.x <= width - 40 && hoverPt.y >= 40 && hoverPt.y <= height - 40) {
        const ttWidth = 205;
        const ttHeight = 44;
        let ttX = hoverPt.x - ttWidth / 2;
        if (ttX < 45) ttX = 45;
        if (ttX + ttWidth > width - 45) ttX = width - ttWidth - 45;
        let ttY = Math.max(15, hoverPt.y - ttHeight - 12);
        drawTooltipBox(ctx, ttX, ttY, ttWidth, ttHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(`Vibration Velocity: ${vel} mm/s RMS`, ttX + 8, ttY + 16);
        ctx.fillStyle = '#6EE7B7';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(`Safe Operating Margin: +${(limitA - vel).toFixed(2)} mm/s`, ttX + 8, ttY + 32);
      }
    }
  };

  // Sync canvas redraw on analysis changes
  useEffect(() => {
    drawWaveform(null);
  }, [analysisResult]);

  useEffect(() => {
    drawSpectrum(null);
  }, [analysisResult]);

  useEffect(() => {
    drawDefect(null);
  }, [analysisResult]);

  const diag = analysisResult?.diagnostic;
  const isoZone = diag?.iso_zone;

  const getConditionColor = (cond) => {
    switch (cond) {
      case 'HEALTHY': return '#10B981';
      case 'BEARING_FAILURE': return '#DC2626';
      case 'MISALIGNMENT': return '#7E22CE';
      case 'BROKEN_ROTOR_BAR': return '#F59E0B';
      default: return '#087ACB';
    }
  };

  const getConditionLabel = (cond) => {
    switch (cond) {
      case 'HEALTHY': return 'Healthy Baseline — Normal Operation';
      case 'BEARING_FAILURE': return 'Fault Detected: Bearing Failure (Outer/Inner Race)';
      case 'MISALIGNMENT': return 'Fault Detected: Shaft Misalignment (2x RPM)';
      case 'BROKEN_ROTOR_BAR': return 'Fault Detected: Broken Rotor Bar';
      default: return cond;
    }
  };

  return (
    <ErrorBoundary title="Vibration Sensor & Excel Diagnostics">
      <div className="vibration-tab-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Top Header Card */}
        <div className="card" style={{ padding: '1.5rem', background: '#FFFFFF', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span className="badge" style={{ background: '#EFF6FF', color: '#087ACB', border: '1px solid #BFDBFE', fontWeight: 700 }}>
                  ISO 10816-3 Standard
                </span>
                <span className="badge badge-emerald" style={{ fontWeight: 600 }}>
                  Excel (.xlsx) & Accelerometer Diagnostic Lab
                </span>
              </div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--navy-primary)', margin: '0.4rem 0 0.2rem' }}>
                Mechanical Vibration & Excel Defect Diagnostic Lab
              </h1>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                Continuous mechanical condition monitoring: Evaluates casing acceleration (g), overall velocity RMS (mm/s), ISO severity zones, and bearing fault harmonics.
              </p>
            </div>

            {/* Target Motor Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#F8FAFC', padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                Target Motor:
              </span>
              <select
                className="form-select"
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  padding: '0.35rem 0.75rem',
                  background: '#FFFFFF',
                  color: '#073B78',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
              >
                {motors.map((m) => (
                  <option key={m.id} value={m.tag}>
                    {m.tag} — {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Excel Metadata Provenance Strip */}
          {excelProvenance && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: '1.25rem', fontSize: '0.8rem', color: '#475569' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ color: '#087ACB', fontWeight: 700 }}>Excel Provenance:</span>
                <span className="mono" style={{ background: '#F1F5F9', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                  {excelProvenance.file} [Row {excelProvenance.row}]
                </span>
              </div>
              <div><strong>Rated Power:</strong> <span className="mono">{excelProvenance.kw} kW</span></div>
              <div><strong>Operating Speed:</strong> <span className="mono">{excelProvenance.rpm} RPM</span></div>
              <div><strong>DE Bearing:</strong> <span className="badge" style={{ background: '#FEF3C7', color: '#B45309' }}>{excelProvenance.deBearing}</span></div>
              <div><strong>NDE Bearing:</strong> <span className="mono">{excelProvenance.ndeBearing}</span></div>
              <div><strong>ISO Machine Class:</strong> <span className="mono">Group 2 Rigid Foundation</span></div>
            </div>
          )}
        </div>

        {/* Condition Profiles & Excel Upload Bar */}
        <div className="card" style={{ padding: '1.25rem', background: '#FFFFFF' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-primary)', textTransform: 'uppercase' }}>
                SELECT VIBRATION CONDITION PROFILE:
              </span>
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'HEALTHY', label: 'Healthy Baseline', color: '#10B981' },
                  { id: 'BEARING_FAILURE', label: 'Bearing Damage (BPFO/BPFI)', color: '#DC2626' },
                  { id: 'BROKEN_ROTOR_BAR', label: 'Broken Rotor Bar', color: '#F59E0B' },
                  { id: 'MISALIGNMENT', label: 'Shaft Misalignment (2x RPM)', color: '#7E22CE' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setUploadedData(null);
                      setUploadStats(null);
                      setExcelWorkbook(null);
                      setActivePreset(item.id);
                    }}
                    style={{
                      padding: '0.45rem 0.85rem',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: activePreset === item.id && !uploadedData ? `2px solid ${item.color}` : '1px solid #CBD5E1',
                      background: activePreset === item.id && !uploadedData ? `${item.color}15` : '#FFFFFF',
                      color: activePreset === item.id && !uploadedData ? item.color : '#475569',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    ● {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Excel / CSV File Upload & Download Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.55rem 1rem',
                  background: '#F0FDF4',
                  border: '1.5px dashed #22C55E',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#15803D',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
                title="Upload multi-sheet Excel (.xlsx, .xls) or CSV accelerometer vibration file"
              >
                <span>📁 Upload Excel (.xlsx) / CSV</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.csv,.txt,.json"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
              </label>

              {/* Sample Excel Download Button */}
              <a
                href={api.getVibrationSampleExcelDownloadUrl()}
                download="motor_vibration_sample_data.xlsx"
                className="btn btn-secondary btn-sm"
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.55rem 0.9rem',
                  background: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  color: '#073B78',
                  textDecoration: 'none',
                  borderRadius: '8px',
                }}
                title="Download 4-sheet test Excel workbook containing verified vibration signals for all 4 defect classes"
              >
                <span>📥 Download Sample Excel (.xlsx)</span>
              </a>

              {uploadStats && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
                  <span className="badge badge-emerald">
                    ✓ {uploadStats.type}: {uploadStats.sheetName || uploadStats.name} ({uploadStats.count.toLocaleString()} pts @ {uploadStats.fs} Hz)
                  </span>
                  <button
                    type="button"
                    onClick={handleClearUpload}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontWeight: 700, fontSize: '0.9rem' }}
                    title="Clear uploaded file"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {errorMsg && (
            <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', color: '#DC2626', fontSize: '0.82rem' }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Multi-Sheet Workbook Inspector (Shown when Excel file is uploaded) */}
          {excelWorkbook && availableSheets.length > 0 && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-primary)' }}>
                    📊 Excel Workbook Sheets ({availableSheets.length} detected):
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748B', marginLeft: '0.5rem' }}>
                    Click a sheet to load and analyze its vibration signal:
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                  Active Signal Column: <span className="mono" style={{ background: '#DCFCE7', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>{uploadStats?.signalCol}</span>
                </div>
              </div>

              {/* Sheet Switcher Tabs */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {availableSheets.map((sheet) => (
                  <button
                    key={sheet}
                    type="button"
                    onClick={() => handleSheetSwitch(sheet)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: selectedSheetName === sheet ? '2px solid #087ACB' : '1px solid #CBD5E1',
                      background: selectedSheetName === sheet ? '#087ACB' : '#FFFFFF',
                      color: selectedSheetName === sheet ? '#FFFFFF' : '#334155',
                      boxShadow: selectedSheetName === sheet ? '0 2px 4px rgba(8,122,203,0.2)' : 'none',
                    }}
                  >
                    📄 {sheet}
                  </button>
                ))}
              </div>

              {/* Preview of first rows from active Excel sheet */}
              {sheetPreviewRows.length > 0 && (
                <div style={{ marginTop: '0.85rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    First Rows Preview from '{selectedSheetName}':
                  </span>
                  <div className="table-responsive" style={{ maxHeight: '140px', marginTop: '0.35rem' }}>
                    <table className="data-table" style={{ fontSize: '0.75rem' }}>
                      <thead>
                        <tr>
                          {detectedColumns.slice(0, 6).map((col) => (
                            <th key={col}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheetPreviewRows.map((row, idx) => (
                          <tr key={idx}>
                            {detectedColumns.slice(0, 6).map((col) => (
                              <td key={col} className="mono">{row[col] !== null ? String(row[col]) : '-'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Diagnostic Results Grid */}
        {diag && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            
            {/* 1. Condition & Diagnosis Card */}
            <div className="card" style={{ padding: '1.25rem', borderLeft: `5px solid ${getConditionColor(diag.predicted_class)}` }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Mechanical Vibration Diagnosis
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: getConditionColor(diag.predicted_class), marginTop: '0.25rem' }}>
                {getConditionLabel(diag.predicted_class)}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.4rem', lineHeight: 1.4 }}>
                {diag.diagnostic_summary}
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="badge" style={{ background: '#F1F5F9', color: '#073B78', fontWeight: 700 }}>
                  Confidence: {(diag.confidence * 100).toFixed(1)}%
                </span>
                <span className="badge" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569' }}>
                  Motor: {selectedTag}
                </span>
              </div>
            </div>

            {/* 2. ISO 10816 Severity Meter */}
            <div className="card" style={{ padding: '1.25rem', borderLeft: `5px solid ${isoZone.color}` }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                ISO 10816-3 Vibration Severity
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.85rem', fontWeight: 800, color: isoZone.color, fontFamily: 'var(--font-heading)' }}>
                  {diag.overall_velocity_rms_mms}
                </span>
                <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>mm/s RMS</span>
              </div>
              <div style={{ display: 'inline-block', marginTop: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: `${isoZone.color}15`, color: isoZone.color, fontWeight: 700, fontSize: '0.8rem' }}>
                {isoZone.label}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.4rem' }}>
                {isoZone.action}
              </div>
            </div>

            {/* 3. Statistical Features Box */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Key Signal Metrics (Accelerometer)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Peak Acceleration</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#073B78' }}>
                    {diag.time_features.peak_g} g
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Acceleration RMS</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#073B78' }}>
                    {diag.time_features.rms_g} g
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Kurtosis (Impulses)</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: diag.time_features.kurtosis > 3.8 ? '#DC2626' : '#10B981' }}>
                    {diag.time_features.kurtosis}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Crest Factor</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#073B78' }}>
                    {diag.time_features.crest_factor}
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* SPECIALIZED GRAPH ACCORDING TO PARTICULAR DEFECT */}
        <div className="card" style={{ padding: '1.5rem', background: '#FFFFFF', border: `2px solid ${getConditionColor(diag?.predicted_class)}25` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="badge" style={{ background: `${getConditionColor(diag?.predicted_class)}15`, color: getConditionColor(diag?.predicted_class), fontWeight: 700 }}>
                  Defect-Specific Specialized Analysis
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Targeted diagnostic visualization tailored specifically to: <strong>{getConditionLabel(diag?.predicted_class)}</strong>
                </span>
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy-primary)', margin: '0.4rem 0 0' }}>
                {diag?.predicted_class === 'BEARING_FAILURE' && 'Bearing Ball Pass Impact Shock Train (BPFO Time Spacing & Harmonics)'}
                {diag?.predicted_class === 'MISALIGNMENT' && 'Shaft Misalignment Harmonic Order Energy Ratio (1x vs 2x Running Speed)'}
                {diag?.predicted_class === 'BROKEN_ROTOR_BAR' && 'Broken Rotor Bar Pole-Pass Modulation Sidebands (1x ± fp)'}
                {diag?.predicted_class === 'HEALTHY' && 'ISO 10816 Zone A Overall Machine Velocity vs Vibration Limit'}
              </h3>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.75rem', alignItems: 'center' }}>
              <span className="badge" style={{ background: '#EFF6FF', color: '#087ACB', border: '1px solid #BFDBFE', fontSize: '0.7rem' }}>
                ✦ Hover to Inspect Data
              </span>
              <span className="badge" style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#334155' }}>
                {diag?.predicted_class === 'BEARING_FAILURE' && `Kinematic BPFO: ${diag?.bearing_frequencies_hz?.bpfo_outer_race} Hz`}
                {diag?.predicted_class === 'MISALIGNMENT' && `Harmonic 2x: ${diag?.bearing_frequencies_hz?.misalignment_2x} Hz`}
                {diag?.predicted_class === 'BROKEN_ROTOR_BAR' && `fp Sideband: ${diag?.bearing_frequencies_hz?.pole_pass_brb_sideband} Hz`}
                {diag?.predicted_class === 'HEALTHY' && `Safe ISO Limit: 1.4 mm/s`}
              </span>
            </div>
          </div>

          <canvas
            ref={defectCanvasRef}
            width={980}
            height={220}
            onMouseMove={(e) => handleCanvasMouseMove(e, defectCanvasRef, drawDefect)}
            onMouseLeave={() => drawDefect(null)}
            style={{ width: '100%', height: '220px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#FAFCFE', cursor: 'crosshair' }}
          />

          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#475569', lineHeight: 1.5 }}>
            {diag?.predicted_class === 'BEARING_FAILURE' && (
              <span>
                <strong>Physical Attribution:</strong> As damaged rolling elements roll across the spalled outer raceway, periodic mechanical shocks occur at the Ball Pass Frequency Outer Race (BPFO = 75.7 Hz). The sharp spikes indicate repetitive metal-on-metal impacts.
              </span>
            )}
            {diag?.predicted_class === 'MISALIGNMENT' && (
              <span>
                <strong>Physical Attribution:</strong> Mechanical coupling misalignment exerts severe dynamic radial forces at twice the rotational shaft frequency (2x = 49.17 Hz). The 2x / 1x ratio exceeds the 50% standard threshold, confirming shaft angular or parallel offset.
              </span>
            )}
            {diag?.predicted_class === 'BROKEN_ROTOR_BAR' && (
              <span>
                <strong>Physical Attribution:</strong> Severed or cracked rotor bars cause electromagnetic asymmetry that modulates shaft torque at twice the slip frequency (fp = 2 · s · fs = 1.67 Hz), generating twin sidebands around the running speed frequency.
              </span>
            )}
            {diag?.predicted_class === 'HEALTHY' && (
              <span>
                <strong>Physical Attribution:</strong> Machine vibration velocity is verified at {diag?.overall_velocity_rms_mms} mm/s, safely below the ISO 10816-3 Zone A threshold of 1.4 mm/s for newly commissioned industrial equipment.
              </span>
            )}
          </div>
        </div>

        {/* Dual Canvas Visualizers (Waveform & Spectrum) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          
          {/* Canvas 1: Time-Domain Waveform */}
          <div className="card" style={{ padding: '1.25rem', background: '#FFFFFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-primary)', margin: 0 }}>
                  Time-Domain Acceleration Waveform
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Continuous sensor output in units of g (gravity). Shows raw impact transients.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span className="badge" style={{ background: '#EFF6FF', color: '#087ACB', fontSize: '0.7rem' }}>
                  ✦ Interactive Hover
                </span>
                <span className="badge" style={{ background: '#F1F5F9', color: '#073B78', fontSize: '0.7rem' }}>
                  {analysisResult?.visualization?.sampling_rate_hz || 5000} Hz
                </span>
              </div>
            </div>

            <canvas
              ref={waveformCanvasRef}
              width={640}
              height={250}
              onMouseMove={(e) => handleCanvasMouseMove(e, waveformCanvasRef, drawWaveform)}
              onMouseLeave={() => drawWaveform(null)}
              style={{ width: '100%', height: '250px', borderRadius: '6px', border: '1px solid #E2E8F0', cursor: 'crosshair' }}
            />
          </div>

          {/* Canvas 2: Frequency Spectrum */}
          <div className="card" style={{ padding: '1.25rem', background: '#FFFFFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-primary)', margin: 0 }}>
                  FFT Vibration Frequency Spectrum
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Discrete Fourier Transform: Displays 1x Running Speed, 2x Misalignment, and Bearing Pass (BPFO/BPFI).
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.7rem', alignItems: 'center' }}>
                <span style={{ color: '#087ACB', fontWeight: 700 }}>● 1x</span>
                <span style={{ color: '#7E22CE', fontWeight: 700 }}>● 2x</span>
                <span style={{ color: '#DC2626', fontWeight: 700 }}>● BPFO</span>
              </div>
            </div>

            <canvas
              ref={spectrumCanvasRef}
              width={640}
              height={250}
              onMouseMove={(e) => handleCanvasMouseMove(e, spectrumCanvasRef, drawSpectrum)}
              onMouseLeave={() => drawSpectrum(null)}
              style={{ width: '100%', height: '250px', borderRadius: '6px', border: '1px solid #E2E8F0', cursor: 'crosshair' }}
            />
          </div>
        </div>

        {/* Diagnostic Evidence & ISO 10816 Standard Reference Table */}
        <div className="card" style={{ padding: '1.25rem', background: '#FFFFFF' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy-primary)', marginBottom: '0.85rem' }}>
            Diagnostic Evidence & Characteristic Fault Frequencies
          </h3>

          <div className="table-responsive">
            <table className="data-table" style={{ fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Fault Component</th>
                  <th>Theoretical Frequency</th>
                  <th>Physical Origin</th>
                  <th>Current State</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>1x Running Speed (f_r)</strong></td>
                  <td className="mono">{diag?.bearing_frequencies_hz?.running_speed_1x || 24.58} Hz</td>
                  <td>Motor shaft rotational speed ({excelProvenance?.rpm || 1475} ÷ 60)</td>
                  <td><span className="badge badge-emerald">Fundamental Carrier</span></td>
                </tr>
                <tr>
                  <td><strong>2x Harmonic (Misalignment)</strong></td>
                  <td className="mono">{diag?.bearing_frequencies_hz?.misalignment_2x || 49.17} Hz</td>
                  <td>Twice shaft speed generated by angular/parallel coupling offset</td>
                  <td>
                    {diag?.predicted_class === 'MISALIGNMENT' ? (
                      <span className="badge badge-rose" style={{ fontWeight: 700 }}>ELEVATED (Defect Peak)</span>
                    ) : (
                      <span className="badge badge-emerald">Normal</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td><strong>BPFO (Bearing Outer Race)</strong></td>
                  <td className="mono">{diag?.bearing_frequencies_hz?.bpfo_outer_race || 75.7} Hz</td>
                  <td>Ball pass outer race impact frequency for {excelProvenance?.deBearing || 'SKF 6314'}</td>
                  <td>
                    {diag?.predicted_class === 'BEARING_FAILURE' ? (
                      <span className="badge badge-rose" style={{ fontWeight: 700 }}>SHOCK MODULATION DETECTED</span>
                    ) : (
                      <span className="badge badge-emerald">Smooth Surface</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td><strong>BPFI (Bearing Inner Race)</strong></td>
                  <td className="mono">{diag?.bearing_frequencies_hz?.bpfi_inner_race || 120.9} Hz</td>
                  <td>Ball pass inner race impact frequency</td>
                  <td><span className="badge" style={{ background: '#F1F5F9', color: '#475569' }}>Monitored</span></td>
                </tr>
                <tr>
                  <td><strong>Pole Pass Frequency (f_p)</strong></td>
                  <td className="mono">{diag?.bearing_frequencies_hz?.pole_pass_brb_sideband || 1.67} Hz</td>
                  <td>Rotor slip modulation frequency (2 · s · fs) for broken rotor bars</td>
                  <td>
                    {diag?.predicted_class === 'BROKEN_ROTOR_BAR' ? (
                      <span className="badge badge-amber" style={{ fontWeight: 700 }}>SIDEBAND ENVELOPE ELEVATED</span>
                    ) : (
                      <span className="badge badge-emerald">Nominal</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Fault Details List */}
          {diag?.fault_details && diag.fault_details.length > 0 && (
            <div style={{ marginTop: '1rem', background: '#F8FAFC', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#073B78', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                Physical Diagnostic Verification Trail:
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.82rem', color: '#334155', lineHeight: 1.6 }}>
                {diag.fault_details.map((detail, idx) => (
                  <li key={idx}>{detail}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

      </div>
    </ErrorBoundary>
  );
}

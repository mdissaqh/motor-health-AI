import React, { useRef, useEffect, useState } from 'react';

/**
 * High-Performance HTML5 Canvas Signal Chart.
 * Mode: 'time' (Current Waveform i(t)) | 'spectrum' (FFT dB Spectrum with sideband markers)
 */
export default function SignalCanvas({
  mode = 'time',
  data = null, // for time: { time_axis_s, current_waveform_a }; for spectrum: { frequency_axis_hz, spectrum_db, markers }
  height = 240,
  title = '',
  units = 'A',
}) {
  const canvasRef = useRef(null);
  const [hoverInfo, setHoverInfo] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Handle high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = height;
    const padding = { top: 25, right: 30, bottom: 35, left: 55 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    // Clear background
    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, w, h);

    if (!data) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No signal data available for rendering.', w / 2, h / 2);
      return;
    }

    if (mode === 'time') {
      const xs = data.time_axis_s || [];
      const ys = data.current_waveform_a || [];
      if (xs.length === 0 || ys.length === 0) return;

      const xMin = xs[0];
      const xMax = xs[xs.length - 1];
      let yMin = Math.min(...ys);
      let yMax = Math.max(...ys);
      const ySpan = Math.max(0.1, yMax - yMin);
      yMin -= ySpan * 0.1;
      yMax += ySpan * 0.1;

      // Draw Grid Lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      const numGridY = 4;
      for (let i = 0; i <= numGridY; i++) {
        const yVal = yMin + (i / numGridY) * (yMax - yMin);
        const yPx = padding.top + plotH - ((yVal - yMin) / (yMax - yMin)) * plotH;
        ctx.beginPath();
        ctx.moveTo(padding.left, yPx);
        ctx.lineTo(w - padding.right, yPx);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${yVal.toFixed(1)} ${units}`, padding.left - 8, yPx + 3);
      }

      // Zero-crossing line
      if (yMin < 0 && yMax > 0) {
        const zeroY = padding.top + plotH - ((0 - yMin) / (yMax - yMin)) * plotH;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(w - padding.right, zeroY);
        ctx.stroke();
      }

      // X-axis ticks
      const numGridX = 5;
      for (let i = 0; i <= numGridX; i++) {
        const xVal = xMin + (i / numGridX) * (xMax - xMin);
        const xPx = padding.left + (i / numGridX) * plotW;
        ctx.fillStyle = '#64748b';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${(xVal * 1000).toFixed(0)} ms`, xPx, h - 12);
      }

      // Plot Signal Waveform
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        const px = padding.left + ((xs[i] - xMin) / (xMax - xMin)) * plotW;
        const py = padding.top + plotH - ((ys[i] - yMin) / (yMax - yMin)) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

    } else if (mode === 'spectrum') {
      const xs = data.frequency_axis_hz || [];
      const ys = data.spectrum_db || [];
      if (xs.length === 0 || ys.length === 0) return;

      const xMax = Math.max(160, xs[xs.length - 1]);
      let yMin = Math.min(...ys);
      let yMax = Math.max(...ys);
      if (yMin === yMax) { yMin -= 20; yMax += 10; }
      const ySpan = Math.max(10, yMax - yMin);
      yMin -= ySpan * 0.05;
      yMax += ySpan * 0.1;

      // Draw Grid Lines (Y: dB)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      const numGridY = 4;
      for (let i = 0; i <= numGridY; i++) {
        const yVal = yMin + (i / numGridY) * (yMax - yMin);
        const yPx = padding.top + plotH - ((yVal - yMin) / (yMax - yMin)) * plotH;
        ctx.beginPath();
        ctx.moveTo(padding.left, yPx);
        ctx.lineTo(w - padding.right, yPx);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${yVal.toFixed(0)} dB`, padding.left - 8, yPx + 3);
      }

      // X-axis ticks (Frequency in Hz)
      const xTicks = [0, 25, 50, 75, 100, 125, 150];
      for (const f of xTicks) {
        if (f > xMax) continue;
        const xPx = padding.left + (f / xMax) * plotW;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.moveTo(xPx, padding.top);
        ctx.lineTo(xPx, padding.top + plotH);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${f} Hz`, xPx, h - 12);
      }

      // Draw Marker Vertical Lines
      const markers = data.markers || [];
      for (const m of markers) {
        if (m.frequency_hz >= 0 && m.frequency_hz <= xMax) {
          const mPx = padding.left + (m.frequency_hz / xMax) * plotW;
          ctx.strokeStyle = m.color || '#f59e0b';
          ctx.lineWidth = 1.25;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(mPx, padding.top);
          ctx.lineTo(mPx, padding.top + plotH);
          ctx.stroke();
          ctx.setLineDash([]);

          // Marker Label on top
          ctx.fillStyle = m.color || '#f59e0b';
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(m.name, mPx, padding.top - 7);
        }
      }

      // Draw Gradient Area under Spectrum Curve
      const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
      grad.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
      grad.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top + plotH);
      for (let i = 0; i < xs.length; i++) {
        const px = padding.left + (xs[i] / xMax) * plotW;
        const py = padding.top + plotH - ((ys[i] - yMin) / (yMax - yMin)) * plotH;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(padding.left + (xs[xs.length - 1] / xMax) * plotW, padding.top + plotH);
      ctx.closePath();
      ctx.fill();

      // Plot Spectrum Curve
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        const px = padding.left + (xs[i] / xMax) * plotW;
        const py = padding.top + plotH - ((ys[i] - yMin) / (yMax - yMin)) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }, [data, mode, height, units]);

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padding = { top: 25, right: 30, bottom: 35, left: 55 };
    const plotW = rect.width - padding.left - padding.right;

    if (x < padding.left || x > rect.width - padding.right || y < padding.top || y > height - padding.bottom) {
      setHoverInfo(null);
      return;
    }

    if (mode === 'spectrum') {
      const xs = data.frequency_axis_hz || [];
      const ys = data.spectrum_db || [];
      if (xs.length === 0) return;
      const xRatio = (x - padding.left) / plotW;
      const targetFreq = xRatio * Math.max(160, xs[xs.length - 1]);
      // Find closest bin
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < xs.length; i++) {
        const diff = Math.abs(xs[i] - targetFreq);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      setHoverInfo({
        xLabel: `Freq: ${xs[closestIdx].toFixed(2)} Hz`,
        yLabel: `Power: ${ys[closestIdx].toFixed(1)} dB`,
      });
    } else {
      const xs = data.time_axis_s || [];
      const ys = data.current_waveform_a || [];
      if (xs.length === 0) return;
      const xRatio = (x - padding.left) / plotW;
      const xMin = xs[0];
      const xMax = xs[xs.length - 1];
      const targetTime = xMin + xRatio * (xMax - xMin);
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < xs.length; i++) {
        const diff = Math.abs(xs[i] - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      setHoverInfo({
        xLabel: `Time: ${(xs[closestIdx] * 1000).toFixed(1)} ms`,
        yLabel: `Current: ${ys[closestIdx].toFixed(2)} A`,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  return (
    <div className="chart-container" style={{ position: 'relative' }}>
      <div className="chart-header">
        <span className="chart-title">{title}</span>
        {hoverInfo ? (
          <div className="mono" style={{ fontSize: '0.75rem', color: '#38bdf8', display: 'flex', gap: '1rem' }}>
            <span>{hoverInfo.xLabel}</span>
            <span>{hoverInfo.yLabel}</span>
          </div>
        ) : (
          <div className="chart-legend">
            {mode === 'spectrum' ? (
              <>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#22d3ee' }}></span> MCSA Spectrum</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#06b6d4' }}></span> Fundamental (fs)</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }}></span> Sidebands (1±2s)fs</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#ec4899' }}></span> 2fs Harmonic</span>
              </>
            ) : (
              <span className="legend-item"><span className="legend-dot" style={{ background: '#06b6d4' }}></span> Stator Current i(t)</span>
            )}
          </div>
        )}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}

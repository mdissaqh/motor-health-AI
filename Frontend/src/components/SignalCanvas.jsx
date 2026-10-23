import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * High-Performance HTML5 Canvas Signal Chart.
 * Mode: 'time' (Current Waveform i(t)) | 'spectrum' (FFT dB Spectrum with sideband markers)
 * Features:
 * - High-DPI Retina resolution
 * - Full Y-axis visibility (no truncated labels)
 * - Staggered, anti-collision marker labels
 * - Interactive mouse hover crosshairs with glowing data points & floating HUD tooltips
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
  const hoverPtRef = useRef(null);

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
    ctx.fillStyle = 'rgba(11, 31, 58, 0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  };

  const renderChart = useCallback((hoverPt = hoverPtRef.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // High-DPI handling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = height;

    // Generous padding so Y-axis labels and top marker labels never get cut off
    const padding = { top: mode === 'spectrum' ? 38 : 28, right: 35, bottom: 35, left: 68 };
    const plotW = Math.max(10, w - padding.left - padding.right);
    const plotH = Math.max(10, h - padding.top - padding.bottom);

    // Deep modern dark background
    ctx.fillStyle = '#0B1F3A';
    ctx.fillRect(0, 0, w, h);

    if (!data) {
      ctx.fillStyle = '#94A3B8';
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
      yMin -= ySpan * 0.12;
      yMax += ySpan * 0.12;

      // Draw Grid Lines (Y-axis)
      ctx.strokeStyle = 'rgba(220, 231, 242, 0.12)';
      ctx.lineWidth = 1;
      const numGridY = 4;
      const unitShort = units.includes('Amp') ? 'A' : units;

      for (let i = 0; i <= numGridY; i++) {
        const yVal = yMin + (i / numGridY) * (yMax - yMin);
        const yPx = padding.top + plotH - ((yVal - yMin) / (yMax - yMin)) * plotH;
        ctx.beginPath();
        ctx.moveTo(padding.left, yPx);
        ctx.lineTo(w - padding.right, yPx);
        ctx.stroke();

        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${yVal >= 0 ? '+' : ''}${yVal.toFixed(1)} ${unitShort}`, padding.left - 8, yPx + 3);
      }

      // Zero-crossing dashed baseline
      if (yMin < 0 && yMax > 0) {
        const zeroY = padding.top + plotH - ((0 - yMin) / (yMax - yMin)) * plotH;
        ctx.strokeStyle = 'rgba(220, 231, 242, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(w - padding.right, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // X-axis ticks (Time in ms)
      const numGridX = 5;
      for (let i = 0; i <= numGridX; i++) {
        const xVal = xMin + (i / numGridX) * (xMax - xMin);
        const xPx = padding.left + (i / numGridX) * plotW;
        ctx.strokeStyle = 'rgba(220, 231, 242, 0.08)';
        ctx.beginPath();
        ctx.moveTo(xPx, padding.top);
        ctx.lineTo(xPx, padding.top + plotH);
        ctx.stroke();

        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${(xVal * 1000).toFixed(0)} ms`, xPx, h - 12);
      }

      // Plot Signal Waveform Line
      ctx.strokeStyle = '#16B9E8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        const px = padding.left + ((xs[i] - xMin) / (xMax - xMin)) * plotW;
        const py = padding.top + plotH - ((ys[i] - yMin) / (yMax - yMin)) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Interactive Cursor Hover Layer
      if (hoverPt && hoverPt.x >= padding.left && hoverPt.x <= w - padding.right) {
        const xRatio = (hoverPt.x - padding.left) / plotW;
        const targetTime = xMin + xRatio * (xMax - xMin);

        // Find nearest sample
        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < xs.length; i++) {
          const diff = Math.abs(xs[i] - targetTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }

        const ptX = padding.left + ((xs[closestIdx] - xMin) / (xMax - xMin)) * plotW;
        const ptY = padding.top + plotH - ((ys[closestIdx] - yMin) / (yMax - yMin)) * plotH;

        // Vertical Crosshair
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(ptX, padding.top);
        ctx.lineTo(ptX, padding.top + plotH);
        ctx.stroke();

        // Horizontal Crosshair
        ctx.beginPath();
        ctx.moveTo(padding.left, ptY);
        ctx.lineTo(w - padding.right, ptY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Concentric target dot on the curve
        ctx.fillStyle = 'rgba(22, 185, 232, 0.25)';
        ctx.beginPath();
        ctx.arc(ptX, ptY, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#16B9E8';
        ctx.beginPath();
        ctx.arc(ptX, ptY, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ptX, ptY, 2, 0, Math.PI * 2);
        ctx.fill();

        // Floating HUD Tooltip Card
        const ttW = 160;
        const ttH = 46;
        let ttX = ptX + 12;
        if (ttX + ttW > w - 10) ttX = ptX - ttW - 12;
        let ttY = Math.max(10, Math.min(h - ttH - 10, ptY - ttH / 2));

        drawTooltipBox(ctx, ttX, ttY, ttW, ttH);
        ctx.fillStyle = '#F8FAFC';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Time: ${(xs[closestIdx] * 1000).toFixed(1)} ms`, ttX + 10, ttY + 18);
        ctx.fillStyle = '#38BDF8';
        ctx.fillText(`i(t): ${ys[closestIdx] >= 0 ? '+' : ''}${ys[closestIdx].toFixed(2)} A`, ttX + 10, ttY + 34);
      }

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
      yMax += ySpan * 0.12;

      // Draw Grid Lines (Y-axis: dB)
      ctx.strokeStyle = 'rgba(220, 231, 242, 0.12)';
      ctx.lineWidth = 1;
      const numGridY = 4;
      for (let i = 0; i <= numGridY; i++) {
        const yVal = yMin + (i / numGridY) * (yMax - yMin);
        const yPx = padding.top + plotH - ((yVal - yMin) / (yMax - yMin)) * plotH;
        ctx.beginPath();
        ctx.moveTo(padding.left, yPx);
        ctx.lineTo(w - padding.right, yPx);
        ctx.stroke();

        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${yVal.toFixed(0)} dB`, padding.left - 8, yPx + 3);
      }

      // X-axis ticks (Frequency in Hz)
      const xTicks = [0, 25, 50, 75, 100, 125, 150];
      for (const f of xTicks) {
        if (f > xMax) continue;
        const xPx = padding.left + (f / xMax) * plotW;
        ctx.strokeStyle = 'rgba(220, 231, 242, 0.08)';
        ctx.beginPath();
        ctx.moveTo(xPx, padding.top);
        ctx.lineTo(xPx, padding.top + plotH);
        ctx.stroke();

        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${f} Hz`, xPx, h - 12);
      }

      // Draw Marker Vertical Lines with Staggered Labels to avoid text collisions
      const rawMarkers = data.markers || [];
      const markers = [...rawMarkers].sort((a, b) => a.frequency_hz - b.frequency_hz);

      for (let mi = 0; mi < markers.length; mi++) {
        const m = markers[mi];
        if (m.frequency_hz >= 0 && m.frequency_hz <= xMax) {
          const mPx = padding.left + (m.frequency_hz / xMax) * plotW;
          ctx.strokeStyle = m.color || '#E9A23B';
          ctx.lineWidth = 1.35;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(mPx, padding.top);
          ctx.lineTo(mPx, padding.top + plotH);
          ctx.stroke();
          ctx.setLineDash([]);

          // Stagger Y position if adjacent markers are close (< 10 Hz apart)
          const isCloseToPrev = mi > 0 && Math.abs(m.frequency_hz - markers[mi - 1].frequency_hz) < 10;
          const labelY = isCloseToPrev ? padding.top - 20 : padding.top - 7;

          // Connecting tick mark
          if (isCloseToPrev) {
            ctx.strokeStyle = m.color || '#E9A23B';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(mPx, padding.top - 12);
            ctx.lineTo(mPx, padding.top);
            ctx.stroke();
          }

          // Marker Label
          ctx.fillStyle = m.color || '#E9A23B';
          ctx.font = 'bold 9px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(m.name, mPx, labelY);
        }
      }

      // Draw Gradient Area under Spectrum Curve
      const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
      grad.addColorStop(0, 'rgba(22, 185, 232, 0.35)');
      grad.addColorStop(1, 'rgba(22, 185, 232, 0.0)');

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

      // Plot Spectrum Curve Line
      ctx.strokeStyle = '#16B9E8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        const px = padding.left + (xs[i] / xMax) * plotW;
        const py = padding.top + plotH - ((ys[i] - yMin) / (yMax - yMin)) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Interactive Cursor Hover Layer
      if (hoverPt && hoverPt.x >= padding.left && hoverPt.x <= w - padding.right) {
        const xRatio = (hoverPt.x - padding.left) / plotW;
        const targetFreq = xRatio * xMax;

        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < xs.length; i++) {
          const diff = Math.abs(xs[i] - targetFreq);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }

        const ptX = padding.left + (xs[closestIdx] / xMax) * plotW;
        const ptY = padding.top + plotH - ((ys[closestIdx] - yMin) / (yMax - yMin)) * plotH;

        // Check proximity to known marker (+/- 2.5 Hz)
        const matchedMarker = markers.find(m => Math.abs(m.frequency_hz - xs[closestIdx]) <= 2.5);
        const highlightColor = matchedMarker ? (matchedMarker.color || '#E9A23B') : '#16B9E8';

        // Vertical & Horizontal Crosshairs
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(ptX, padding.top);
        ctx.lineTo(ptX, padding.top + plotH);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(padding.left, ptY);
        ctx.lineTo(w - padding.right, ptY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Concentric target dot on spectrum curve
        ctx.fillStyle = `${highlightColor}33`;
        ctx.beginPath();
        ctx.arc(ptX, ptY, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = highlightColor;
        ctx.beginPath();
        ctx.arc(ptX, ptY, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ptX, ptY, 2, 0, Math.PI * 2);
        ctx.fill();

        // Floating HUD Tooltip Card
        const ttW = matchedMarker ? 210 : 160;
        const ttH = matchedMarker ? 60 : 46;
        let ttX = ptX + 12;
        if (ttX + ttW > w - 10) ttX = ptX - ttW - 12;
        let ttY = Math.max(10, Math.min(h - ttH - 10, ptY - ttH / 2));

        drawTooltipBox(ctx, ttX, ttY, ttW, ttH);
        ctx.fillStyle = '#F8FAFC';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Freq: ${xs[closestIdx].toFixed(2)} Hz`, ttX + 10, ttY + 18);
        ctx.fillStyle = '#38BDF8';
        ctx.fillText(`Power: ${ys[closestIdx].toFixed(1)} dB`, ttX + 10, ttY + 34);

        if (matchedMarker) {
          ctx.fillStyle = matchedMarker.color || '#F59E0B';
          ctx.font = 'bold 10px JetBrains Mono, monospace';
          ctx.fillText(`★ ${matchedMarker.name}`, ttX + 10, ttY + 50);
        }
      }
    }
  }, [data, mode, height, units]);

  // Redraw when data or window dimensions change
  useEffect(() => {
    renderChart(null);
  }, [renderChart]);

  // Window resize observer to ensure sharp canvas scaling
  useEffect(() => {
    const handleResize = () => {
      renderChart(hoverPtRef.current);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderChart]);

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padding = { top: mode === 'spectrum' ? 38 : 28, right: 35, bottom: 35, left: 68 };
    if (x < padding.left || x > rect.width - padding.right || y < padding.top || y > height - padding.bottom) {
      hoverPtRef.current = null;
      setHoverInfo(null);
      renderChart(null);
      return;
    }

    const hoverPt = { x, y };
    hoverPtRef.current = hoverPt;
    renderChart(hoverPt);

    // Update header info text as well
    if (mode === 'spectrum') {
      const xs = data.frequency_axis_hz || [];
      const ys = data.spectrum_db || [];
      if (xs.length > 0) {
        const plotW = rect.width - padding.left - padding.right;
        const targetFreq = ((x - padding.left) / plotW) * Math.max(160, xs[xs.length - 1]);
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
      }
    } else {
      const xs = data.time_axis_s || [];
      const ys = data.current_waveform_a || [];
      if (xs.length > 0) {
        const plotW = rect.width - padding.left - padding.right;
        const xMin = xs[0];
        const xMax = xs[xs.length - 1];
        const targetTime = xMin + ((x - padding.left) / plotW) * (xMax - xMin);
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
          yLabel: `i(t): ${ys[closestIdx] >= 0 ? '+' : ''}${ys[closestIdx].toFixed(2)} A`,
        });
      }
    }
  };

  const handleMouseLeave = () => {
    hoverPtRef.current = null;
    setHoverInfo(null);
    renderChart(null);
  };

  return (
    <div className="chart-container" style={{ position: 'relative' }}>
      <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="chart-title" style={{ fontWeight: 700, fontSize: '0.9rem', color: '#073B78' }}>{title}</span>
          <span className="badge" style={{ background: '#EFF6FF', color: '#0284C7', border: '1px solid #BFDBFE', fontSize: '0.68rem', padding: '0.1rem 0.45rem' }}>
            ✦ Hover to Inspect Data
          </span>
        </div>
        {hoverInfo ? (
          <div className="mono" style={{ fontSize: '0.75rem', color: '#0284C7', background: '#F0F9FF', padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid #BAE6FD', display: 'flex', gap: '0.85rem', fontWeight: 600 }}>
            <span>{hoverInfo.xLabel}</span>
            <span>{hoverInfo.yLabel}</span>
          </div>
        ) : (
          <div className="chart-legend" style={{ display: 'flex', gap: '0.6rem', fontSize: '0.72rem' }}>
            {mode === 'spectrum' ? (
              <>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#22d3ee' }}></span> MCSA Spectrum</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#06b6d4' }}></span> Fundamental (50 Hz)</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }}></span> Sidebands (1±2s)fs</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#ec4899' }}></span> 2fs Harmonic</span>
              </>
            ) : (
              <span className="legend-item"><span className="legend-dot" style={{ background: '#06b6d4' }}></span> Stator Current i(t) (A)</span>
            )}
          </div>
        )}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block', borderRadius: '6px', cursor: 'crosshair', boxShadow: '0 2px 8px rgba(11,31,58,0.12)' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}


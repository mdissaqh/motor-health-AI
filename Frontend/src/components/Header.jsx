import React from 'react';

export default function Header({
  activeTab,
  onNavigateToDiagnose,
  motors = [],
  selectedMotorId,
  setSelectedMotorId,
  backendHealth,
  onToggleSidebar,
  onOpenMobileSidebar,
}) {
  const getTabTitle = (tab) => {
    switch (tab) {
      case 'overview':
        return { title: 'Fleet Overview & Diagnostic Activity', subtitle: 'Non-invasive condition monitoring across industrial induction motor assets' };
      case 'diagnose':
        return { title: 'Diagnose Motor — Upload File', subtitle: 'Upload stator current recordings (CSV/JSON) with auto-initialized Excel operating conditions' };
      case 'lab':
        return { title: 'Diagnostic Analysis & Signal Lab', subtitle: 'Interactive current waveforms, MCSA Fourier spectra, and Hugging Face AI graph explanations' };
      case 'vibration':
        return { title: 'Vibration Sensor & Mechanical Lab', subtitle: 'ISO 10816 vibration severity, accelerometer spectrum, and bearing impact fault analysis' };
      case 'motor3d':
        return { title: '3D Motor Digital Twin & Defect Animation', subtitle: 'Interactive 3D induction motor visualization with real-time component defect localization' };

      case 'performance':
        return { title: 'Model Performance & Benchmark Evaluation', subtitle: 'Reproducible multi-class metrics, confusion matrix, and probability calibration audit' };
      case 'samples':
        return { title: 'Dataset Provenance & Downloadable Samples', subtitle: 'Explore public benchmark recordings and download verified test CSV files' };
      default:
        return { title: 'Motor Health AI', subtitle: 'Digital Diagnostic Lab' };
    }
  };

  const meta = getTabTitle(activeTab);

  return (
    <header className="app-top-header">
      <div className="top-header-left">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          className="sidebar-toggle-btn mobile-only"
          onClick={onOpenMobileSidebar}
          aria-label="Open Navigation Menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Desktop Sidebar Toggle */}
        <button
          type="button"
          className="sidebar-toggle-btn desktop-only"
          onClick={onToggleSidebar}
          aria-label="Toggle Sidebar Navigation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="page-title-block">
          <h1 className="top-header-title">{meta.title}</h1>
          <p className="top-header-subtitle desktop-only">{meta.subtitle}</p>
        </div>
      </div>

      <div className="top-header-right">
        {/* Motor Quick Selector */}
        {motors && motors.length > 0 && (
          <div className="header-asset-select-wrapper desktop-only">
            <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Asset:
            </span>
            <select
              className="form-select"
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                padding: '0.35rem 0.75rem',
                width: 'auto',
                background: '#1E293B',
                color: '#FFFFFF',
                border: '1px solid #334155',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
              value={selectedMotorId || ''}
              onChange={(e) => setSelectedMotorId(e.target.value)}
            >
              <option value="" style={{ background: '#1E293B', color: '#FFFFFF' }}>
                All Fleet Motors
              </option>
              {motors.map((m) => (
                <option key={m.id} value={m.id} style={{ background: '#1E293B', color: '#FFFFFF' }}>
                  {m.tag} — {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Backend ML Engine Status */}
        <div className="status-indicator" title="Scientific MCSA Signal Processing & Random Forest Engine">
          <span className={`status-dot ${backendHealth?.status === 'OK' ? 'online' : 'offline'}`} />
          <span style={{ fontSize: '0.78rem', color: backendHealth?.status === 'OK' ? '#34d399' : '#fb7185', fontWeight: 600 }}>
            {backendHealth?.status === 'OK' ? 'ML Engine Online' : 'Connecting...'}
          </span>
        </div>

        {/* Quick Upload Action Button */}
        {activeTab !== 'diagnose' && onNavigateToDiagnose && (
          <button
            type="button"
            className="btn btn-primary btn-sm desktop-only"
            onClick={onNavigateToDiagnose}
            style={{ fontWeight: 600, padding: '0.4rem 0.85rem' }}
          >
            + Upload File
          </button>
        )}
      </div>
    </header>
  );
}

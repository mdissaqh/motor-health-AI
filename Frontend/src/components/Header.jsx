import React from 'react';

export default function Header({
  activeTab,
  setActiveTab,
  motors = [],
  selectedMotorId,
  setSelectedMotorId,
  backendHealth,
}) {
  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { id: 'diagnose', label: 'Diagnose Motor', icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z' },
    { id: 'lab', label: 'Diagnostic Lab', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'maintenance', label: 'Maintenance Center', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { id: 'performance', label: 'Model Performance', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { id: 'variable', label: 'Variable-Condition Lab', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
  ];

  return (
    <header className="header-bar">
      <div className="app-container">
        <div className="header-inner">
          {/* Brand Logo */}
          <div className="brand-section">
            <div className="brand-logo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v3m0 12v3M3 12h3m12 0h3" />
                <path d="M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            </div>
            <div>
              <div className="brand-title">
                Motor Health AI
                <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem' }}>MCSA 2.0</span>
              </div>
              <div className="brand-subtitle">
                Digital Diagnostic Lab & Predictive Maintenance
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="nav-tabs" aria-label="Main Navigation">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`nav-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Fleet Selector & System Health */}
          <div className="system-status">
            {motors.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label htmlFor="header-motor-select" style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Asset:
                </label>
                <select
                  id="header-motor-select"
                  className="form-select"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', width: 'auto', background: 'rgba(10, 14, 23, 0.8)' }}
                  value={selectedMotorId}
                  onChange={(e) => setSelectedMotorId(e.target.value)}
                >
                  <option value="">All Fleet Assets</option>
                  {motors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.tag} — {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="status-indicator" title={backendHealth?.model_version || 'Service Status'}>
              <span className={`status-dot ${backendHealth?.status === 'OK' ? 'online' : 'offline'}`} />
              <span style={{ color: backendHealth?.status === 'OK' ? '#34d399' : '#fb7185' }}>
                {backendHealth?.status === 'OK' ? 'ML Engine Online' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

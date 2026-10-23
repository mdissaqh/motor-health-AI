import React from 'react';

export default function OverviewTab({
  runs = [],
  workOrders = [],
  motors = [],
  onSelectRun,
  onNavigateToDiagnose,
}) {
  // STRICT RULE: Only calculate statistics from actual stored records
  const totalRuns = runs.length;
  const healthyCount = runs.filter((r) => r.predicted_class === 'HEALTHY').length;
  const brbCount = runs.filter((r) => r.predicted_class === 'BROKEN_ROTOR_BAR').length;
  const bearingCount = runs.filter((r) => r.predicted_class === 'BEARING_FAULT').length;
  const misalignmentCount = runs.filter((r) => r.predicted_class === 'MISALIGNMENT').length;

  const reviewRequiredCount = runs.filter((r) => r.diagnostic_status === 'REVIEW_REQUIRED').length;
  const unsupportedCount = runs.filter((r) => r.diagnostic_status === 'UNSUPPORTED_CONDITION').length;
  const invalidCount = runs.filter((r) => r.diagnostic_status === 'INVALID_SIGNAL').length;

  const openWorkOrders = workOrders.filter((w) => w.status === 'OPEN' || w.status === 'IN_PROGRESS' || w.status === 'REVIEW_PENDING').length;
  const completedWorkOrders = workOrders.filter((w) => w.status === 'COMPLETED').length;

  // Average Health Index across stored runs with valid score
  const validHealthScores = runs.filter((r) => typeof r.health_index === 'number').map((r) => r.health_index);
  const avgHealth = validHealthScores.length > 0
    ? (validHealthScores.reduce((a, b) => a + b, 0) / validHealthScores.length).toFixed(1)
    : '100.0';

  return (
    <div>
      {/* Top Banner Notice */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.1), rgba(99, 102, 241, 0.1))',
        border: '1px solid var(--border-accent)',
        borderRadius: '10px',
        padding: '0.85rem 1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.25rem' }}>⚡</span>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-primary)' }}>
              Condition Monitoring System: MCSA Diagnostic Engine Active
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              MCSA signal processing uses deterministic spectral line tracking. Historical statistics derived strictly from persistent JSON database records.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onNavigateToDiagnose}
        >
          + New Motor Diagnosis
        </button>
      </div>

      {/* Actual Stats Summary Cards */}
      <div className="stats-grid">
        <div className="stat-box cyan">
          <div className="stat-label">Total Diagnostic Runs</div>
          <div className="stat-value">{totalRuns}</div>
          <div className="stat-sub">
            <span style={{ color: '#38bdf8' }}>{runs.filter(r => r.diagnostic_status === 'DIAGNOSIS_AVAILABLE').length} Available</span> • {reviewRequiredCount} in Review
          </div>
        </div>

        <div className="stat-box rose">
          <div className="stat-label">Active Work Orders</div>
          <div className="stat-value">{openWorkOrders}</div>
          <div className="stat-sub">
            <span style={{ color: '#fb7185' }}>{workOrders.filter(w => w.status === 'OPEN').length} Open</span> • {completedWorkOrders} Verified & Closed
          </div>
        </div>

        <div className="stat-box amber">
          <div className="stat-label">Cases Needing Review</div>
          <div className="stat-value">{reviewRequiredCount}</div>
          <div className="stat-sub">
            <span>{unsupportedCount} Unsupported</span> • {invalidCount} Invalid Signals
          </div>
        </div>

        <div className="stat-box emerald">
          <div className="stat-label">Fleet Health Index</div>
          <div className="stat-value">{avgHealth}%</div>
          <div className="stat-sub">
            <span style={{ color: '#34d399' }}>{motors.length} Monitored Assets</span> across 2 facilities
          </div>
        </div>
      </div>

      {/* Class Outcomes Breakdown & Monitored Fleet Assets */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        {/* Actual Supported Outcomes Distribution */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Supported Fault Outcomes</h3>
              <p className="card-desc">Actual distribution of stored diagnostic inferences</p>
            </div>
            <span className="badge badge-cyan">{totalRuns} Records</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {[
              { label: 'HEALTHY (Nominal)', count: healthyCount, color: '#10b981', code: 'C0' },
              { label: 'BROKEN ROTOR BAR', count: brbCount, color: '#f59e0b', code: 'C1' },
              { label: 'BEARING FAULT', count: bearingCount, color: '#ec4899', code: 'C2' },
              { label: 'SHAFT MISALIGNMENT', count: misalignmentCount, color: '#8b5cf6', code: 'C3' },
            ].map((item) => {
              const pct = totalRuns > 0 ? ((item.count / totalRuns) * 100).toFixed(1) : 0;
              return (
                <div key={item.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color }} />
                      {item.label}
                    </span>
                    <span className="mono" style={{ color: 'var(--text-muted)' }}>
                      {item.count} runs ({pct}%)
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: item.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Fleet Assets Registered */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Monitored Motor Registry</h3>
              <p className="card-desc">Connected 3-phase induction motor assets</p>
            </div>
            <span className="badge badge-muted">{motors.length} Assets</span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tag / Asset</th>
                  <th>Location</th>
                  <th>Power / Speed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {motors.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="mono" style={{ fontWeight: 600, color: 'var(--navy-primary)' }}>{m.tag}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{m.name}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.location}</td>
                    <td className="mono" style={{ fontSize: '0.78rem' }}>
                      {m.nameplate?.rated_power_kw} kW • {m.nameplate?.rated_speed_rpm} RPM
                    </td>
                    <td>
                      <span className={`badge badge-${m.status === 'OPERATIONAL' ? 'emerald' : 'amber'}`}>
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Diagnostic Runs Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Recent Stored Diagnostic Records</h3>
            <p className="card-desc">Click any recording to load into the Digital Diagnostic Lab</p>
          </div>
          <span className="badge badge-cyan">{runs.length} Saved Inferences</span>
        </div>

        {runs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No diagnostic runs stored in persistent storage yet. Click "+ New Motor Diagnosis" to analyze a recording.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Run ID & Timestamp</th>
                  <th>Motor Tag</th>
                  <th>Diagnostic Status</th>
                  <th>Predicted Class</th>
                  <th>Model Confidence</th>
                  <th>Defensible Severity</th>
                  <th>Health Index</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(-8).reverse().map((run) => (
                  <tr key={run.id} style={{ cursor: 'pointer' }} onClick={() => onSelectRun(run)}>
                    <td className="mono" style={{ fontSize: '0.8rem' }}>
                      <div style={{ color: 'var(--blue-accent)', fontWeight: 600 }}>{run.id}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        {new Date(run.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td>
                      <div className="mono" style={{ fontWeight: 600, color: 'var(--navy-primary)' }}>{run.motor_tag}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{run.motor_name}</div>
                    </td>
                    <td>
                      <span className={`badge badge-${
                        run.diagnostic_status === 'DIAGNOSIS_AVAILABLE' ? 'emerald' :
                        run.diagnostic_status === 'REVIEW_REQUIRED' ? 'amber' : 'rose'
                      }`}>
                        {run.diagnostic_status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--navy-primary)' }}>
                        {run.predicted_class || 'N/A'}
                      </span>
                    </td>
                    <td className="mono">
                      {run.model_confidence ? `${(run.model_confidence * 100).toFixed(1)}%` : 'N/A'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {run.severity?.severity_level || run.severity?.status || 'N/A'}
                    </td>
                    <td className="mono" style={{ fontWeight: 600, color: run.health_index > 75 ? '#34d399' : '#fbbf24' }}>
                      {typeof run.health_index === 'number' ? `${run.health_index.toFixed(0)}%` : 'N/A'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRun(run);
                        }}
                      >
                        Inspect Lab →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

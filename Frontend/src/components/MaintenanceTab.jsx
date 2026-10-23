import React, { useState } from 'react';
import { api } from '../api';

export default function MaintenanceTab({
  workOrders = [],
  onWorkOrderUpdated,
  selectedWorkOrder,
  setSelectedWorkOrder,
}) {
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  
  // Modal / transition state
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [targetStatus, setTargetStatus] = useState('IN_PROGRESS');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [operatorName, setOperatorName] = useState('Reliability Engineer');

  // Verification step checkoffs
  const [checkedVerifications, setCheckedVerifications] = useState({});

  const filteredOrders = workOrders.filter((wo) => {
    if (filterStatus === 'ALL') return true;
    return wo.status === filterStatus;
  });

  const activeOrder = selectedWorkOrder || workOrders[0] || null;

  const handleSelectOrder = (wo) => {
    setSelectedWorkOrder(wo);
    setUpdateError('');
  };

  const openTransitionModal = (nextStatus) => {
    setTargetStatus(nextStatus);
    setReviewerNotes('');
    setUpdateError('');
    setShowStatusModal(true);
  };

  const handleConfirmTransition = async () => {
    if (!activeOrder) return;
    setIsUpdating(true);
    setUpdateError('');

    try {
      const verificationSteps = (activeOrder.human_verification_steps || []).map((step, idx) => ({
        step,
        verified: !!checkedVerifications[idx],
      }));

      // Task 5 Gate: If completing, enforce human verification steps
      if (targetStatus === 'COMPLETED') {
        const unverified = (activeOrder.human_verification_steps || []).filter((_, idx) => !checkedVerifications[idx]);
        if (unverified.length > 0) {
          throw new Error(
            `Task 5 Safeguard: Completing work order is BLOCKED until all ${activeOrder.human_verification_steps.length} physical verification steps are checked.`
          );
        }
      }

      const response = await api.updateWorkOrderStatus(activeOrder.id, {
        status: targetStatus,
        reviewer_notes: reviewerNotes,
        user: operatorName,
        verification_steps: verificationSteps,
      });

      if (response.status === 'SUCCESS' && response.data) {
        onWorkOrderUpdated(response.data);
        setSelectedWorkOrder(response.data);
        setShowStatusModal(false);
      } else {
        throw new Error(response.message || 'Status transition failed.');
      }
    } catch (err) {
      setUpdateError(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleVerificationCheck = (idx) => {
    setCheckedVerifications((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  return (
    <div>
      {/* Top Controls & Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: '#fff', fontWeight: 600 }}>
            Maintenance Operations & Work Orders
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Traceable corrective & predictive work orders generated from scientific MCSA inferences.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
          {['ALL', 'OPEN', 'IN_PROGRESS', 'REVIEW_PENDING', 'COMPLETED'].map((st) => (
            <button
              key={st}
              type="button"
              className={`btn btn-sm ${filterStatus === st ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterStatus(st)}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Orders Table on Left, Detail & Actions on Right */}
      <div className="grid-2" style={{ alignItems: 'start', gridTemplateColumns: '1.1fr 1.4fr' }}>
        {/* Work Orders List Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Work Orders Registry</h3>
              <p className="card-desc">Showing {filteredOrders.length} orders ({filterStatus})</p>
            </div>
            <span className="badge badge-cyan">{workOrders.length} Total</span>
          </div>

          {filteredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No work orders match filter '{filterStatus}'.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredOrders.map((wo) => {
                const isSelected = activeOrder?.id === wo.id;
                return (
                  <div
                    key={wo.id}
                    onClick={() => handleSelectOrder(wo)}
                    style={{
                      background: isSelected ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      border: isSelected ? '1px solid var(--cyan-primary)' : '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '0.85rem 1rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span className="mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8' }}>
                        {wo.id}
                      </span>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <span className={`badge badge-${wo.priority === 'CRITICAL' ? 'rose' : wo.priority === 'HIGH' ? 'amber' : 'cyan'}`}>
                          {wo.priority}
                        </span>
                        <span className={`badge badge-${wo.status === 'COMPLETED' ? 'emerald' : wo.status === 'OPEN' ? 'rose' : 'amber'}`}>
                          {wo.status}
                        </span>
                      </div>
                    </div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fff', marginBottom: '0.2rem' }}>
                      {wo.title}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      <span>Asset: <strong style={{ color: '#cbd5e1' }}>{wo.motor_tag}</strong></span>
                      <span>Created: {new Date(wo.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Work Order Detail Card */}
        {activeOrder ? (
          <div className="card" style={{ borderTop: `3px solid ${activeOrder.priority === 'CRITICAL' ? '#f43f5e' : '#06b6d4'}` }}>
            <div className="card-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <span className="mono" style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600 }}>{activeOrder.id}</span>
                  <span className={`badge badge-${activeOrder.status === 'COMPLETED' ? 'emerald' : 'amber'}`}>{activeOrder.status}</span>
                  <span className="badge badge-rose">{activeOrder.priority} Priority</span>
                </div>
                <h3 className="card-title" style={{ fontSize: '1.15rem' }}>{activeOrder.title}</h3>
                <p className="card-desc">Asset: {activeOrder.motor_tag} — {activeOrder.motor_name}</p>
              </div>

              {/* Download Report Button */}
              <a
                href={api.getExportUrl(activeOrder.id)}
                download={`WorkOrder_${activeOrder.id}.md`}
                className="btn btn-secondary btn-sm"
                title="Download Traceable Markdown Report"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Export Report
              </a>
            </div>

            {/* Linked Diagnostic Evidence Summary */}
            <div style={{ background: '#0a0e17', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                Traceable Diagnostic Evidence
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Diagnostic Run:</span>
                  <p className="mono" style={{ color: '#38bdf8' }}>{activeOrder.diagnostic_run_id}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Predicted Fault:</span>
                  <p style={{ color: '#fff', fontWeight: 600 }}>{activeOrder.predicted_class}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Defensible Severity:</span>
                  <p style={{ color: '#fbbf24', fontWeight: 600 }}>{activeOrder.severity || 'N/A'}</p>
                </div>
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <strong>Priority Basis:</strong> {activeOrder.priority_basis}
              </p>
            </div>

            {/* Conservative Inspection Tasks Checklist */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.65rem' }}>
                Conservative Inspection Tasks ({activeOrder.suggested_inspection_tasks?.length || 0})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(activeOrder.suggested_inspection_tasks || []).map((task, idx) => (
                  <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <span className="mono" style={{ color: '#38bdf8', fontSize: '0.8rem', fontWeight: 600 }}>{idx + 1}.</span>
                    <span style={{ fontSize: '0.825rem', color: 'var(--text-main)', lineHeight: 1.4 }}>{task}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mandatory Human Verification Steps Gate */}
            <div style={{ background: 'rgba(99, 102, 241, 0.08)', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '1rem' }}>🛡️</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#a5b4fc', textTransform: 'uppercase' }}>
                  Task 5 Safeguard: Mandatory Human Verification Gate
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                Physical verification steps required prior to final work order signoff:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {(activeOrder.human_verification_steps || []).map((step, idx) => (
                  <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!checkedVerifications[idx] || activeOrder.status === 'COMPLETED'}
                      onChange={() => toggleVerificationCheck(idx)}
                      disabled={activeOrder.status === 'COMPLETED'}
                      style={{ accentColor: '#06b6d4', width: '15px', height: '15px' }}
                    />
                    <span>{step}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Status Transition Action Buttons */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                Assigned to: <strong style={{ color: '#fff' }}>{activeOrder.assigned_to || 'Reliability Team'}</strong>
              </span>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {activeOrder.status === 'OPEN' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => openTransitionModal('IN_PROGRESS')}
                  >
                    Start Inspection (IN_PROGRESS) →
                  </button>
                )}
                {activeOrder.status === 'IN_PROGRESS' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openTransitionModal('REVIEW_PENDING')}
                    >
                      Route for Review
                    </button>
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      onClick={() => openTransitionModal('COMPLETED')}
                    >
                      Verify & Complete Order ✓
                    </button>
                  </>
                )}
                {activeOrder.status === 'REVIEW_PENDING' && (
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    onClick={() => openTransitionModal('COMPLETED')}
                  >
                    Approve & Complete Order ✓
                  </button>
                )}
                {activeOrder.status === 'COMPLETED' && (
                  <span className="badge badge-emerald" style={{ padding: '0.4rem 0.8rem' }}>
                    ✓ Work Order Completed & Verified
                  </span>
                )}
              </div>
            </div>

            {/* Audit History Log */}
            {activeOrder.audit_trail && activeOrder.audit_trail.length > 0 && (
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Audit History Trail ({activeOrder.audit_trail.length}):
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.4rem' }}>
                  {activeOrder.audit_trail.map((entry, idx) => (
                    <div key={idx} style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', gap: '0.5rem' }}>
                      <span className="mono">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      <span style={{ color: 'var(--text-muted)' }}>[{entry.user}]:</span>
                      <span style={{ color: '#fff' }}>{entry.action}</span>
                      {entry.notes && <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>"{entry.notes}"</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Modal: Status Transition & Human Verification */}
      {showStatusModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>
                Confirm Transition to {targetStatus}
              </h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowStatusModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '1rem' }}>
                You are transitioning work order <strong>{activeOrder?.id}</strong> from <em>{activeOrder?.status}</em> to <strong>{targetStatus}</strong>.
              </p>

              {targetStatus === 'COMPLETED' && (
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.85rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 600 }}>
                    Physical Verification Check: Ensure you have confirmed stator insulation resistance, physical rotor integrity, and baseline vibration.
                  </p>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Operator / Signoff Engineer Name:</label>
                <input
                  type="text"
                  className="form-control"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Reviewer Notes & Action Details:</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  placeholder="Enter physical observations, component inspection findings, or verification notes..."
                />
              </div>

              {updateError && (
                <div style={{ color: '#fb7185', fontSize: '0.8rem', background: 'rgba(244,63,94,0.1)', padding: '0.5rem', borderRadius: '6px' }}>
                  ⚠️ {updateError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowStatusModal(false)}
                disabled={isUpdating}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmTransition}
                disabled={isUpdating}
              >
                {isUpdating ? 'Saving Transition...' : `Confirm → ${targetStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

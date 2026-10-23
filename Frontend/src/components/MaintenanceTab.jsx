import React, { useState } from 'react';
import { api } from '../api';
import ErrorBoundary from './ErrorBoundary';

function renderStepText(step) {
  if (!step) return '';
  if (typeof step === 'string') return step;
  if (step.name && step.instruction) {
    return `${step.name} — ${step.instruction}`;
  }
  return step.instruction || step.name || step.task || String(step);
}

function renderTaskText(task) {
  if (!task) return '';
  if (typeof task === 'string') return task;
  const prefix = task.task ? `${task.task}: ` : '';
  return `${prefix}${task.details || task.description || ''}`;
}

export default function MaintenanceTab({
  workOrders = [],
  onWorkOrderUpdated,
  selectedWorkOrder,
  setSelectedWorkOrder,
  onNavigateToDiagnose,
}) {
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');

  // AI Recommendation State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const [aiError, setAiError] = useState('');

  // Modal / transition state
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [targetStatus, setTargetStatus] = useState('IN_PROGRESS');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [operatorName, setOperatorName] = useState('Reliability Engineer');

  // Verification step checkoffs
  const [checkedVerifications, setCheckedVerifications] = useState({});

  const safeWorkOrders = Array.isArray(workOrders) ? workOrders : [];

  const filteredOrders = safeWorkOrders.filter((wo) => {
    if (!wo) return false;
    if (filterStatus === 'ALL') return true;
    return wo.status === filterStatus;
  });

  const activeOrder = selectedWorkOrder || filteredOrders[0] || safeWorkOrders[0] || null;

  const handleSelectOrder = (wo) => {
    setSelectedWorkOrder(wo);
    setUpdateError('');
    setAiRecommendation(null);
    setAiError('');
  };

  const openTransitionModal = (nextStatus) => {
    setTargetStatus(nextStatus);
    setReviewerNotes('');
    setUpdateError('');
    setShowStatusModal(true);
  };

  // Extract raw verification steps safely whether array of strings or objects
  const rawVerificationSteps = activeOrder?.human_verification_steps ||
    activeOrder?.mandatory_human_verification_gate?.verification_steps ||
    [];

  // Extract inspection tasks safely
  const rawInspectionTasks = activeOrder?.suggested_inspection_tasks ||
    activeOrder?.inspection_tasks ||
    [];

  const handleConfirmTransition = async () => {
    if (!activeOrder) return;
    setIsUpdating(true);
    setUpdateError('');

    try {
      const verificationSteps = rawVerificationSteps.map((step, idx) => ({
        step: typeof step === 'string' ? step : (step.instruction || step.name || JSON.stringify(step)),
        verified: !!checkedVerifications[idx] || (step.confirmed === true),
      }));

      // Task 5 Gate: If completing, enforce human verification steps
      if (targetStatus === 'COMPLETED') {
        const unverified = rawVerificationSteps.filter((step, idx) => {
          if (step.confirmed === true) return false;
          return !checkedVerifications[idx];
        });

        if (unverified.length > 0) {
          throw new Error(
            `Safety Rule: Completing this work order is BLOCKED until all ${rawVerificationSteps.length} physical verification checks are completed and checked off.`
          );
        }
      }

      const response = await api.updateWorkOrderStatus(activeOrder.id, {
        status: targetStatus,
        reviewer_notes: reviewerNotes,
        user: operatorName,
        verification_steps: verificationSteps,
      });

      if (response && response.status === 'SUCCESS' && response.data) {
        if (onWorkOrderUpdated) onWorkOrderUpdated(response.data);
        if (setSelectedWorkOrder) setSelectedWorkOrder(response.data);
        setShowStatusModal(false);
      } else {
        throw new Error(response?.message || 'Status transition failed.');
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

  // Request Hugging Face AI maintenance advice
  const handleRequestAiAdvice = async () => {
    if (!activeOrder) return;
    setAiLoading(true);
    setAiError('');

    try {
      const payload = {
        diagnostic_run: {
          motor_tag: activeOrder.motor_tag,
          motor_name: activeOrder.motor_name,
          predicted_class: activeOrder.predicted_class,
          model_confidence: activeOrder.model_confidence,
          severity: activeOrder.severity,
          spectral_regions: activeOrder.spectral_evidence,
          operating_conditions: activeOrder.dataset_provenance,
        },
        motor: {
          tag: activeOrder.motor_tag,
          name: activeOrder.motor_name,
          location: activeOrder.motor_location,
        },
      };

      const res = await api.recommendMaintenance(payload);
      if (res.status === 'SUCCESS' && res.data) {
        setAiRecommendation(res.data);
      } else {
        throw new Error(res.message || 'AI request failed');
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const getStatusDesc = (st) => {
    switch (st) {
      case 'OPEN':
        return 'Newly generated. A technician has not started the on-site physical inspection yet.';
      case 'IN_PROGRESS':
        return 'Under active inspection. A technician is conducting electrical & mechanical checks.';
      case 'REVIEW_PENDING':
        return 'Inspection findings logged. Awaiting engineering supervisor approval.';
      case 'COMPLETED':
        return 'All inspection tasks and mandatory physical verification checks are finished and verified.';
      default:
        return st || 'Unknown status';
    }
  };

  // EMPTY STATE: If no work orders exist in the system
  if (safeWorkOrders.length === 0) {
    return (
      <ErrorBoundary title="Maintenance Center">
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
          <h2 style={{ fontSize: '1.35rem', color: 'var(--navy-primary)', marginBottom: '0.5rem' }}>
            Maintenance Center — No Active Work Orders
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '540px', margin: '0 auto 1.5rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
            There are currently no maintenance work orders registered. Work orders are generated automatically when a motor current diagnosis detects a fault or requires human engineering review.
          </p>
          {onNavigateToDiagnose && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onNavigateToDiagnose}
              style={{ padding: '0.65rem 1.5rem', fontWeight: 600 }}
            >
              Run Motor Diagnosis Now →
            </button>
          )}
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary title="Maintenance Center">
      <div>
        {/* Top Controls & Status Filters */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.35rem', color: 'var(--navy-primary)', fontWeight: 700, margin: 0 }}>
              Maintenance Center & Work Orders
            </h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Actionable inspection checklists and physical verification workflows linked to MCSA inferences.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--bg-surface-elevated)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
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

        {/* Main Grid Layout: List on Left, Detail on Right */}
        <div className="grid-2" style={{ alignItems: 'start', gridTemplateColumns: '1.1fr 1.6fr', gap: '1.25rem' }}>
          
          {/* Column 1: Work Orders List */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: '1rem' }}>
              <div>
                <h3 className="card-title">Work Order Registry</h3>
                <p className="card-desc">Showing {filteredOrders.length} of {safeWorkOrders.length} orders ({filterStatus})</p>
              </div>
              <span className="badge badge-cyan">{safeWorkOrders.length} Total</span>
            </div>

            {filteredOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                No work orders match the filter '{filterStatus}'.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {filteredOrders.map((wo) => {
                  const isSelected = activeOrder?.id === wo.id;
                  const priority = wo.priority || 'MEDIUM';
                  const status = wo.status || 'OPEN';

                  return (
                    <div
                      key={wo.id}
                      onClick={() => handleSelectOrder(wo)}
                      style={{
                        background: isSelected ? 'rgba(8, 122, 203, 0.12)' : 'var(--bg-card)',
                        border: isSelected ? '1px solid var(--blue-accent)' : '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '0.85rem 1rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span className="mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--blue-accent)' }}>
                          {wo.id}
                        </span>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <span className={`badge badge-${priority === 'CRITICAL' ? 'rose' : priority === 'HIGH' ? 'amber' : 'cyan'}`}>
                            {priority}
                          </span>
                          <span className={`badge badge-${status === 'COMPLETED' ? 'emerald' : status === 'OPEN' ? 'rose' : 'amber'}`}>
                            {status}
                          </span>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--navy-primary)', marginBottom: '0.2rem' }}>
                        {wo.title || `${wo.motor_tag} - Maintenance Inspection`}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        <span>Motor: <strong style={{ color: 'var(--navy-primary)' }}>{wo.motor_tag}</strong></span>
                        <span>{wo.created_at ? new Date(wo.created_at).toLocaleDateString() : 'Active'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Column 2: Selected Work Order Details */}
          {activeOrder ? (
            <div className="card" style={{ borderTop: `4px solid ${activeOrder.priority === 'CRITICAL' ? '#f43f5e' : '#087ACB'}` }}>
              <div className="card-header" style={{ marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                    <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--blue-accent)', fontWeight: 700 }}>{activeOrder.id}</span>
                    <span className={`badge badge-${activeOrder.status === 'COMPLETED' ? 'emerald' : 'amber'}`}>{activeOrder.status}</span>
                    <span className="badge badge-rose">{activeOrder.priority || 'HIGH'} Priority</span>
                  </div>
                  <h2 className="card-title" style={{ fontSize: '1.2rem', color: 'var(--navy-primary)' }}>
                    {activeOrder.title || `${activeOrder.motor_tag} Inspection`}
                  </h2>
                  <p className="card-desc">Work Order Summary & Verification Checklist</p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleRequestAiAdvice}
                    disabled={aiLoading}
                    title="Generate Hugging Face AI recommendations"
                  >
                    {aiLoading ? 'Thinking...' : '✨ Ask AI'}
                  </button>

                  <a
                    href={api.getExportUrl(activeOrder.id)}
                    download={`WorkOrder_${activeOrder.id}.md`}
                    className="btn btn-secondary btn-sm"
                    title="Download Plain-English Markdown Report"
                  >
                    📥 Export Report
                  </a>
                </div>
              </div>

              {/* AI Recommendation Banner (if triggered) */}
              {aiRecommendation && (
                <div style={{ background: 'var(--purple-bg)', border: '1px solid var(--purple-border)', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1rem' }}>🤖</span>
                      <strong style={{ color: 'var(--purple-calib)', fontSize: '0.85rem' }}>
                        Hugging Face AI Maintenance Advice
                      </strong>
                    </div>
                    <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                      {aiRecommendation.provider === 'HUGGING_FACE_AI' ? 'HF: ' + aiRecommendation.model : 'Deterministic Fallback'}
                    </span>
                  </div>

                  {aiRecommendation.recommendations && (
                    <div style={{ fontSize: '0.825rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                      <p style={{ marginBottom: '0.5rem' }}>
                        <strong style={{ color: 'var(--navy-primary)' }}>Engineering Justification:</strong> {aiRecommendation.recommendations.engineering_justification}
                      </p>
                      {aiRecommendation.recommendations.follow_up_checks && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <strong>Follow-up:</strong> {aiRecommendation.recommendations.follow_up_checks}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {aiError && (
                <div style={{ color: 'var(--rose-danger)', fontSize: '0.8rem', background: 'var(--rose-bg)', border: '1px solid var(--rose-border)', padding: '0.65rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  ⚠️ AI Recommendation Notice: {aiError}
                </div>
              )}

              {/* 6 Plain-English Questions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* 1. Which motor needs attention? */}
                <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--blue-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    1. Which motor needs attention?
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--navy-primary)', marginTop: '0.25rem' }}>
                    {activeOrder.motor_tag} — {activeOrder.motor_name}
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem', margin: 0 }}>
                    Location: {activeOrder.motor_location || 'Facility'} • Linked Diagnostic Run: <span className="mono" style={{ color: 'var(--blue-accent)', fontWeight: 600 }}>{activeOrder.diagnostic_run_id || 'N/A'}</span>
                  </p>
                </div>

                {/* 2. What did the system detect? */}
                <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--amber-warning)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    2. What did the system detect?
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy-primary)' }}>
                      {activeOrder.predicted_class || 'Condition Alert'}
                    </span>
                    <span className="badge badge-cyan" style={{ fontSize: '0.75rem' }}>
                      Severity: {typeof activeOrder.severity === 'object' ? (activeOrder.severity.severity_level || activeOrder.severity.status || 'Advisory') : (activeOrder.severity || 'Advisory')}
                    </span>
                    {activeOrder.model_confidence && (
                      <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        Confidence: {(activeOrder.model_confidence * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Why is an inspection recommended? */}
                <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--purple-calib)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    3. Why is an inspection recommended?
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginTop: '0.35rem', lineHeight: 1.5, margin: '0.35rem 0 0' }}>
                    {activeOrder.priority_basis || activeOrder.description || 'Abnormal stator current modulations detected above nominal threshold. Scheduled physical inspection is recommended to confirm defect before mechanical failure worsens.'}
                  </p>
                </div>

                {/* 4. What should the technician check? */}
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--emerald-success)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                    4. What should the technician check? ({rawInspectionTasks.length} tasks)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {rawInspectionTasks.map((task, idx) => (
                      <div key={idx} style={{ background: '#FFFFFF', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <span className="mono" style={{ color: 'var(--blue-accent)', fontSize: '0.8rem', fontWeight: 700 }}>Task {idx + 1}:</span>
                        <span style={{ fontSize: '0.825rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
                          {renderTaskText(task)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. What needs human verification before action? */}
                <div style={{ background: 'var(--purple-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--purple-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>🛡️</span>
                    <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--purple-calib)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      5. What needs human verification before action?
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-main)', marginBottom: '0.65rem', lineHeight: 1.45 }}>
                    <strong>Safety Rule:</strong> Never dismantle or order replacement parts based solely on an AI prediction. Complete and tick off every physical verification step below:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {rawVerificationSteps.map((step, idx) => {
                      const isConfirmed = step.confirmed === true || !!checkedVerifications[idx] || activeOrder.status === 'COMPLETED';
                      return (
                        <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.825rem', color: 'var(--text-main)', cursor: 'pointer', background: '#FFFFFF', border: '1px solid var(--border-subtle)', padding: '0.55rem 0.75rem', borderRadius: '6px' }}>
                          <input
                            type="checkbox"
                            checked={isConfirmed}
                            onChange={() => toggleVerificationCheck(idx)}
                            disabled={activeOrder.status === 'COMPLETED'}
                            style={{ accentColor: 'var(--blue-accent)', width: '16px', height: '16px' }}
                          />
                          <span>{renderStepText(step)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 6. Current work-order status & actions */}
                <div style={{ background: 'var(--bg-surface-elevated)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--blue-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      6. Current work-order status
                    </div>
                    <span className={`badge badge-${activeOrder.status === 'COMPLETED' ? 'emerald' : activeOrder.status === 'OPEN' ? 'rose' : 'amber'}`}>
                      {activeOrder.status}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
                    {getStatusDesc(activeOrder.status)}
                  </p>

                  {/* Status action buttons */}
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {activeOrder.status === 'OPEN' && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => openTransitionModal('IN_PROGRESS')}
                      >
                        Start On-Site Inspection →
                      </button>
                    )}
                    {activeOrder.status === 'IN_PROGRESS' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openTransitionModal('REVIEW_PENDING')}
                        >
                          Send for Supervisor Review
                        </button>
                        <button
                          type="button"
                          className="btn btn-success btn-sm"
                          onClick={() => openTransitionModal('COMPLETED')}
                        >
                          Confirm Verifications & Complete Order ✓
                        </button>
                      </>
                    )}
                    {activeOrder.status === 'REVIEW_PENDING' && (
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        onClick={() => openTransitionModal('COMPLETED')}
                      >
                        Approve & Mark Completed ✓
                      </button>
                    )}
                    {activeOrder.status === 'COMPLETED' && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--emerald-success)', fontWeight: 600 }}>
                        ✓ Work order fully completed and verified by reliability engineer.
                      </span>
                    )}
                  </div>
                </div>

                {/* Audit History Log */}
                {activeOrder.audit_trail && activeOrder.audit_trail.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Audit History Log ({activeOrder.audit_trail.length} events):
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.4rem' }}>
                      {activeOrder.audit_trail.map((entry, idx) => (
                        <div key={idx} style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', gap: '0.5rem' }}>
                          <span className="mono">{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
                          <span style={{ color: 'var(--text-muted)' }}>[{entry.user}]:</span>
                          <span style={{ color: 'var(--navy-primary)', fontWeight: 600 }}>{entry.action}</span>
                          {entry.notes && <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>"{entry.notes}"</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
              Select a work order from the list on the left to view details and inspection tasks.
            </div>
          )}
        </div>

        {/* Modal: Status Transition & Human Verification */}
        {showStatusModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h3 style={{ fontSize: '1.1rem', color: 'var(--navy-primary)' }}>
                  Update Work Order to: {targetStatus.replace('_', ' ')}
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
                  You are updating work order <strong>{activeOrder?.id}</strong> from <em>{activeOrder?.status}</em> to <strong>{targetStatus}</strong>.
                </p>

                {targetStatus === 'COMPLETED' && (
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.85rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)', marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 600, margin: 0 }}>
                      ✓ Physical Verification Required: Make sure all verification checkmarks have been ticked in section 5 before confirming completion.
                    </p>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Technician / Engineer Name:</label>
                  <input
                    type="text"
                    className="form-control"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Notes & Physical Observations:</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    placeholder="Record physical inspection findings (e.g. stator resistance OK, shaft alignment verified)..."
                  />
                </div>

                {updateError && (
                  <div style={{ color: '#fb7185', fontSize: '0.8rem', background: 'rgba(244,63,94,0.1)', padding: '0.65rem', borderRadius: '6px' }}>
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
                  {isUpdating ? 'Saving...' : `Confirm → ${targetStatus.replace('_', ' ')}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

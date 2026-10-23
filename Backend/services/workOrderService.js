/**
 * Evidence-Linked Maintenance Work Order Service.
 * 
 * Manages the lifecycle, human review gates, status transitions,
 * conservative templates, and audit history of maintenance work orders.
 */

const storage = require('./storage');
const { getInspectionTemplate } = require('./inspectionTemplates');

// Allowed status transitions state machine
const ALLOWED_TRANSITIONS = {
  REVIEW_PENDING: ['OPEN', 'REJECTED', 'CANCELLED'],
  OPEN: ['ASSIGNED', 'CANCELLED', 'REVIEW_PENDING'],
  ASSIGNED: ['IN_PROGRESS', 'OPEN', 'CANCELLED'],
  IN_PROGRESS: ['VERIFICATION_REQUIRED', 'COMPLETED', 'CANCELLED'],
  VERIFICATION_REQUIRED: ['COMPLETED', 'IN_PROGRESS', 'REJECTED'],
  COMPLETED: [], // Terminal
  REJECTED: [],  // Terminal
  CANCELLED: [], // Terminal
};

/**
 * Creates an evidence-linked work order from a diagnostic run result.
 * 
 * Enforces Task 6:
 * Prevents invalid signals and unsupported conditions from creating
 * misleading automatic corrective work orders.
 */
function createWorkOrderFromDiagnosticRun(diagnosticRun, motor = null, userOptions = {}) {
  const diagStatus = diagnosticRun.diagnostic_status;

  // Task 6 Safeguard 1: Reject Invalid Signals
  if (diagStatus === 'INVALID_SIGNAL') {
    return {
      created: false,
      alert_type: 'INSTRUMENTATION_ALERT',
      message: 'Signal validation failed. Automatic corrective maintenance work order prohibited for invalid waveforms.',
      recommended_action: diagnosticRun.recommended_action || 'Inspect current transducer wiring and sampling parameters.',
      diagnostic_run_id: diagnosticRun.id,
    };
  }

  // Task 6 Safeguard 2: Reject Unsupported Operating Regimes
  if (diagStatus === 'UNSUPPORTED_CONDITION') {
    return {
      created: false,
      alert_type: 'OPERATIONAL_ADVISORY',
      message: 'Motor operating outside validated steady-state MCSA physics. Automatic corrective work order prohibited.',
      recommended_action: diagnosticRun.recommended_action || 'Operate motor within rated speed/load before re-testing.',
      diagnostic_run_id: diagnosticRun.id,
    };
  }

  const predictedClass = diagnosticRun.predicted_class || 'UNKNOWN';
  const isHealthy = predictedClass === 'HEALTHY';
  const isReviewRequired = diagStatus === 'REVIEW_REQUIRED';

  // If signal is healthy and diagnosis is available, no corrective work order is generated unless explicitly requested
  if (isHealthy && diagStatus === 'DIAGNOSIS_AVAILABLE' && !userOptions.force_create) {
    return {
      created: false,
      alert_type: 'BASELINE_LOGGED',
      message: 'Motor diagnosed as healthy with normal physical balance. No corrective work order required.',
      diagnostic_run_id: diagnosticRun.id,
    };
  }

  // Extract key physical metrics for severity and priority
  const brbDeltaDb = diagnosticRun.key_features && diagnosticRun.key_features.brb_min_delta_db
    ? diagnosticRun.key_features.brb_min_delta_db.value
    : undefined;

  const severityData = diagnosticRun.severity || {
    status: 'UNKNOWN',
    severity_level: 'Severity unavailable — insufficient validated labels.',
    measurement_basis: 'No validated ground-truth scale.',
    standard_reference: 'Not applicable',
  };

  // Determine conservative inspection template and priority
  const template = getInspectionTemplate(predictedClass, severityData.status, brbDeltaDb);

  // Set initial status based on certainty
  let initialStatus = 'OPEN';
  let initialNotes = 'Automated work order generated from high-confidence MCSA diagnostic run.';

  if (isReviewRequired) {
    initialStatus = 'REVIEW_PENDING';
    const triggerList = (diagnosticRun.human_review_triggers || []).join('; ');
    initialNotes = `Flagged for specialist human review before scheduling: ${triggerList}`;
  }

  // Construct Work Order
  const workOrderData = {
    diagnostic_run_id: diagnosticRun.id,
    motor_id: motor ? motor.id : (diagnosticRun.motor_id || 'UNKNOWN-ASSET'),
    motor_tag: motor ? motor.tag : 'UNTAGGED',
    motor_name: motor ? motor.name : 'Induction Motor',
    motor_location: motor ? motor.location : 'Plant Floor',
    diagnostic_status: diagStatus,
    predicted_class: predictedClass,
    model_confidence: diagnosticRun.model_confidence,
    calibrated_probabilities: diagnosticRun.calibrated_probabilities || {},
    raw_class_scores: diagnosticRun.raw_class_scores || {},
    severity: severityData,
    priority: userOptions.priority || template.priority,
    target_completion_date: template.target_completion_date,
    status: initialStatus,
    assigned_to: userOptions.assigned_to || (isReviewRequired ? 'RELIABILITY_ENGINEERING_QUEUE' : 'ELECTRICAL_MAINTENANCE_CREW'),
    human_review_triggers: diagnosticRun.human_review_triggers || [],
    spectral_evidence: diagnosticRun.spectral_regions || [],
    key_features: diagnosticRun.key_features || {},
    corroborating_indicators: diagnosticRun.corroborating_indicators || [],
    operational_warnings: diagnosticRun.diagnostic_warnings || [],
    dataset_provenance: diagnosticRun.provenance || {},
    model_version: diagnosticRun.model_version || 'mcsa_rf_v1.0.0',
    title: `${motor ? motor.tag : 'ASSET'} - ${template.title}`,
    description: template.description,
    safety_protocol: template.safety_protocol,
    priority_basis: template.priority_basis,
    inspection_tasks: template.initial_inspection_tasks,
    mandatory_human_verification_gate: template.mandatory_human_verification_gate,
    reviewer_notes: initialNotes,
    completion_outcome: null,
    created_by: userOptions.user || 'AUTOMATED_DIAGNOSTICS',
    creator_role: userOptions.role || 'CONDITION_MONITORING_SYSTEM',
    initial_notes: initialNotes,
  };

  const createdOrder = storage.addWorkOrder(workOrderData);
  return {
    created: true,
    work_order: createdOrder,
    alert_type: isReviewRequired ? 'REVIEW_REQUIRED_WORK_ORDER' : 'CORRECTIVE_WORK_ORDER',
  };
}

/**
 * Validates and executes a work order status transition.
 * Enforces business logic and human verification gates.
 */
function updateWorkOrderStatus(orderId, newStatus, userMetadata = {}) {
  const existing = storage.getWorkOrderById(orderId);
  if (!existing) {
    throw new Error(`Work Order '${orderId}' does not exist.`);
  }

  const currentStatus = existing.status;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(newStatus) && newStatus !== currentStatus) {
    throw new Error(
      `Invalid status transition from '${currentStatus}' to '${newStatus}'. ` +
      `Allowed transitions: [${allowed.join(', ')}].`
    );
  }

  // Task 5: Enforce Mandatory Human Verification Gate before COMPLETION of corrective faults
  if (newStatus === 'COMPLETED' && existing.predicted_class !== 'HEALTHY') {
    const gate = existing.mandatory_human_verification_gate;
    if (gate && gate.sign_off_required) {
      const activeSteps = userMetadata.verification_steps_update || gate.verification_steps || [];
      const allConfirmed = activeSteps.length > 0 && activeSteps.every(step => step.confirmed);
      if (!allConfirmed && !userMetadata.override_verification) {
        throw new Error(
          `Cannot complete work order: Mandatory verification gate '${gate.gate_name}' has unconfirmed steps. ` +
          `A human verification test must be confirmed by ${gate.sign_off_role} before major repair completion.`
        );
      }
    }
  }

  const patch = {
    status: newStatus,
    reviewer_notes: userMetadata.notes || existing.reviewer_notes,
  };

  if (userMetadata.assigned_to) {
    patch.assigned_to = userMetadata.assigned_to;
  }

  if (userMetadata.completion_outcome) {
    patch.completion_outcome = {
      ...userMetadata.completion_outcome,
      completed_at: new Date().toISOString(),
      signed_off_by: userMetadata.user || 'SUPERVISOR',
    };
  }

  if (userMetadata.verification_steps_update) {
    const updatedGate = { ...existing.mandatory_human_verification_gate };
    updatedGate.verification_steps = userMetadata.verification_steps_update;
    patch.mandatory_human_verification_gate = updatedGate;
  }

  return storage.updateWorkOrder(orderId, patch, {
    user: userMetadata.user || 'USER',
    role: userMetadata.role || 'MAINTENANCE_ENGINEER',
    action: `STATUS_CHANGE_TO_${newStatus}`,
    notes: userMetadata.notes || `Transitioned status from ${currentStatus} to ${newStatus}.`,
  });
}

/**
 * Generates an auditable text/markdown report export for a work order.
 */
function exportWorkOrderReport(orderId) {
  const order = storage.getWorkOrderById(orderId);
  if (!order) {
    throw new Error(`Work Order '${orderId}' not found.`);
  }

  const motor = storage.getMotorById(order.motor_id);

  let md = `# MAINTENANCE WORK ORDER REPORT
**Work Order ID:** ${order.id}  
**Asset Tag:** ${order.motor_tag} (${order.motor_name})  
**Current Status:** \`${order.status}\`  
**Priority:** \`${order.priority}\`  
**Created Date:** ${order.created_at}  
**Target Completion:** ${order.target_completion_date || 'N/A'}  
**Assigned To:** ${order.assigned_to || 'Unassigned'}  

---

## 1. Asset Nameplate & Specifications
- **Motor ID:** ${order.motor_id}
- **Location:** ${order.motor_location}
- **Rated Power:** ${motor?.nameplate?.rated_power_kw || 'N/A'} kW
- **Rated Voltage:** ${motor?.nameplate?.rated_voltage_v || 'N/A'} V
- **Rated Speed:** ${motor?.nameplate?.rated_speed_rpm || 'N/A'} RPM
- **Poles:** ${motor?.nameplate?.poles || 'N/A'}
- **Drive-End Bearing:** ${motor?.nameplate?.bearing_de || 'N/A'}
- **Non-Drive-End Bearing:** ${motor?.nameplate?.bearing_nde || 'N/A'}

---

## 2. Automated MCSA Diagnostic Evidence
> [!IMPORTANT]
> All diagnostic findings below represent automated signal processing indicators.
> Confirmatory physical inspections must be executed as prescribed in Section 4.

- **Diagnostic Status:** \`${order.diagnostic_status}\`
- **Predicted Fault Class:** \`${order.predicted_class}\`
- **Model Confidence:** ${(order.model_confidence * 100).toFixed(1)}% (Calibrated)
- **Model Version:** \`${order.model_version}\`
- **Diagnostic Run ID:** \`${order.diagnostic_run_id}\`

### Defensible Severity Status
- **Severity Level:** **${order.severity?.severity_level || 'N/A'}**
- **Measurement Basis:** ${order.severity?.measurement_basis || 'N/A'}
- **Standard Reference:** ${order.severity?.standard_reference || 'N/A'}

### Key Signal Indicators
`;

  if (order.key_features) {
    for (const [key, feat] of Object.entries(order.key_features)) {
      md += `- **${feat.feature_name}:** ${feat.value} ${feat.unit} (Nominal: ${feat.nominal_range[0]} - ${feat.nominal_range[1]} ${feat.unit}) -> **${feat.status}**\n`;
    }
  }

  md += `\n### Spectral Regions of Interest\n`;
  if (order.spectral_evidence && order.spectral_evidence.length > 0) {
    for (const reg of order.spectral_evidence) {
      md += `- **${reg.name}:** Center = ${reg.center_frequency_hz} Hz, Power = ${reg.measured_power_db} dB, Delta = ${reg.delta_db_relative_to_fund !== null ? reg.delta_db_relative_to_fund + ' dB' : 'Carrier'}\n  *Relevance:* ${reg.diagnostic_relevance}\n`;
    }
  }

  if (order.human_review_triggers && order.human_review_triggers.length > 0) {
    md += `\n### Human Review Triggers\n`;
    order.human_review_triggers.forEach(t => {
      md += `- [!] ${t}\n`;
    });
  }

  md += `\n---\n\n## 3. Safety Protocol & Work Authorization\n`;
  md += `**Protocol:** ${order.safety_protocol || 'Standard plant electrical safety.'}\n`;
  md += `**Priority Basis:** ${order.priority_basis || 'Preventative scheduling.'}\n`;

  md += `\n---\n\n## 4. Prescribed Inspection Tasks\n`;
  if (order.inspection_tasks) {
    order.inspection_tasks.forEach(t => {
      md += `### Step ${t.step}: ${t.task} [\`${t.status}\`]\n`;
      md += `- **Details:** ${t.details}\n`;
      md += `- **Required Equipment:** ${(t.required_tools || []).join(', ')}\n\n`;
    });
  }

  if (order.mandatory_human_verification_gate) {
    const gate = order.mandatory_human_verification_gate;
    md += `---\n\n## 5. Mandatory Human Verification Gate\n`;
    md += `**Gate Name:** ${gate.gate_name}\n`;
    md += `**Requirement:** ${gate.requirement}\n`;
    md += `**Authorized Role:** \`${gate.sign_off_role}\`\n\n`;

    gate.verification_steps.forEach(step => {
      md += `- [${step.confirmed ? 'X' : ' '}] **${step.code} - ${step.name}:**\n  ${step.instruction}\n  *Notes:* ${step.inspector_notes || 'Pending execution'}\n`;
    });
  }

  md += `\n---\n\n## 6. Audit Trail & Change History\n`;
  if (order.history) {
    order.history.forEach(h => {
      md += `- **${h.timestamp}** [${h.user} (${h.role})]: \`${h.action}\` -> Previous: \`${h.previous_status}\`, New: \`${h.new_status}\`. Notes: ${h.notes}\n`;
    });
  }

  if (order.completion_outcome) {
    const c = order.completion_outcome;
    md += `\n---\n\n## 7. Confirmed Physical Inspection Outcome\n`;
    md += `- **Completed At:** ${c.completed_at}\n`;
    md += `- **Signed Off By:** ${c.signed_off_by}\n`;
    md += `- **Confirmed Physical Fault:** ${c.confirmed_fault || 'None'}\n`;
    md += `- **Physical Findings:** ${c.physical_findings || 'N/A'}\n`;
    md += `- **Corrective Action Taken:** ${c.actions_taken || 'N/A'}\n`;
  }

  return md;
}

module.exports = {
  createWorkOrderFromDiagnosticRun,
  updateWorkOrderStatus,
  exportWorkOrderReport,
  ALLOWED_TRANSITIONS,
};

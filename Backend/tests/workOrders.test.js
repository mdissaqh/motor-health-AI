/**
 * End-to-End & Integration Tests for Maintenance Work Orders (Phase 5).
 * 
 * Verifies:
 * 1. Persistent storage of motors, diagnostic runs, and work orders.
 * 2. Automated work order generation linked to diagnostic runs.
 * 3. Prevention of automatic work orders for invalid signals and unsupported conditions (Task 6).
 * 4. Human-review routing to REVIEW_PENDING for ambiguous or conflicting indicators.
 * 5. Conservative inspection templates and EPRI severity preservation.
 * 6. Mandatory human verification gate before repair/replacement completion.
 * 7. State machine status transition enforcement.
 * 8. Immutable audit history logging for all changes.
 * 9. Downloadable report export with clear distinction between recommendation and physical inspection.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const app = require('../server');
const storage = require('../services/storage');
const workOrderService = require('../services/workOrderService');

describe('Phase 5: Evidence-Linked Maintenance Work Orders', () => {

  test('1. Motor registry retrieves seed motors with full nameplate specifications', () => {
    const motors = storage.getMotors();
    assert.ok(motors.length >= 4, 'Expected at least 4 registered motors in seed catalog');

    const mtr101 = storage.getMotorById('MTR-101');
    assert.ok(mtr101, 'Motor MTR-101 should exist');
    assert.equal(mtr101.tag, 'PUMP-CW-01');
    assert.equal(mtr101.nameplate.rated_power_kw, 75.0);
    assert.equal(mtr101.nameplate.poles, 4);
    assert.equal(mtr101.nameplate.bearing_de, 'SKF 6314-2Z');
  });

  test('2. Clear BRB diagnosis generates an OPEN work order with EPRI severity and conservative template', () => {
    // Simulated diagnostic run from verified MCSA BRB model output
    const mockBrbRun = storage.addDiagnosticRun({
      motor_id: 'MTR-101',
      motor_tag: 'PUMP-CW-01',
      motor_name: 'Cooling Water Circulation Pump Motor',
      diagnostic_status: 'DIAGNOSIS_AVAILABLE',
      status_explanation: 'High-confidence diagnosis supported by corroborating MCSA physical indicators.',
      predicted_class: 'BROKEN_ROTOR_BAR',
      fault_code: 'FAULT_BROKEN_ROTOR_BAR',
      model_confidence: 0.994,
      calibrated_probabilities: {
        HEALTHY: 0.0001,
        BROKEN_ROTOR_BAR: 0.994,
        BEARING_FAULT: 0.0058,
        MISALIGNMENT: 0.0001,
      },
      raw_class_scores: {
        HEALTHY: 0.0,
        BROKEN_ROTOR_BAR: 0.98,
        BEARING_FAULT: 0.02,
        MISALIGNMENT: 0.0,
      },
      severity: {
        status: 'FAULT_DETECTED',
        severity_level: 'Severe — Multiple broken rotor bars',
        measurement_basis: 'Sideband attenuation: 39.8 dB relative to fundamental',
        standard_reference: 'EPRI NP-7502 / Thomson-Rankin MCSA Guidelines',
        quantitative_metric: 'Delta dB: 39.8 dB',
      },
      spectral_regions: [
        {
          name: 'Fundamental Supply Carrier (fs)',
          center_frequency_hz: 50.0,
          measured_amplitude_a: 10.0,
          measured_power_db: 20.0,
          delta_db_relative_to_fund: 0.0,
          diagnostic_relevance: 'Primary carrier baseline.',
        },
        {
          name: 'Broken Rotor Bar Lower Sideband (fs - 2s*fs)',
          center_frequency_hz: 48.0,
          measured_amplitude_a: 0.102,
          measured_power_db: -19.8,
          delta_db_relative_to_fund: 39.8,
          diagnostic_relevance: 'Key indicator of broken rotor bars.',
        },
      ],
      key_features: {
        brb_min_delta_db: {
          feature_name: 'BRB Sideband Attenuation (Delta dB)',
          value: 39.8,
          unit: 'dB',
          nominal_range: [54.0, 100.0],
          status: 'ELEVATED',
        },
      },
      corroborating_indicators: [
        'Fundamental supply carrier identified at 50.00 Hz.',
        'Characteristic (1 +/- 2s)fs sideband detected with 39.8 dB attenuation.',
      ],
      diagnostic_warnings: ['Elevated BRB sideband detected.'],
      provenance: {
        dataset_id: 'TEST_SUITE',
        sampling_rate_hz: 5000.0,
        motor_slip: 0.02,
      },
      model_version: 'mcsa_rf_v1.0.0',
    });

    const motor = storage.getMotorById('MTR-101');
    const result = workOrderService.createWorkOrderFromDiagnosticRun(mockBrbRun, motor, {
      user: 'RELIABILITY_BOT',
      role: 'SYSTEM',
    });

    assert.equal(result.created, true, 'Work order should be created');
    assert.equal(result.alert_type, 'CORRECTIVE_WORK_ORDER');

    const wo = result.work_order;
    assert.equal(wo.status, 'OPEN');
    assert.equal(wo.priority, 'HIGH'); // 39.8 dB is < 45 dB, triggering HIGH priority
    assert.equal(wo.diagnostic_run_id, mockBrbRun.id);
    assert.equal(wo.motor_id, 'MTR-101');
    assert.equal(wo.predicted_class, 'BROKEN_ROTOR_BAR');
    assert.equal(wo.severity.severity_level, 'Severe — Multiple broken rotor bars');
    assert.equal(wo.severity.standard_reference, 'EPRI NP-7502 / Thomson-Rankin MCSA Guidelines');

    // Conservative template verification
    assert.ok(wo.inspection_tasks.length >= 3, 'Should have initial inspection tasks');
    assert.equal(wo.inspection_tasks[0].task, 'Operational Load Verification');

    // Mandatory human verification gate
    assert.ok(wo.mandatory_human_verification_gate, 'Mandatory verification gate must exist');
    assert.equal(wo.mandatory_human_verification_gate.sign_off_required, true);
    assert.equal(wo.mandatory_human_verification_gate.sign_off_role, 'CHIEF_RELIABILITY_ENGINEER');
    assert.equal(wo.mandatory_human_verification_gate.verification_steps.length, 2);
    assert.equal(wo.mandatory_human_verification_gate.verification_steps[0].code, 'VERIF-BRB-01');

    // Audit history initialization
    assert.ok(wo.history.length >= 1);
    assert.equal(wo.history[0].action, 'CREATED');
    assert.equal(wo.history[0].new_status, 'OPEN');
  });

  test('3. Task 6 Safeguard: INVALID_SIGNAL strictly refuses automatic work order creation', () => {
    const invalidRun = storage.addDiagnosticRun({
      motor_id: 'MTR-204',
      diagnostic_status: 'INVALID_SIGNAL',
      status_explanation: 'Signal validation failed: Truncated signal duration 0.0500s is below 0.20s minimum.',
      predicted_class: null,
      model_confidence: null,
      diagnostic_warnings: ['Duration below minimum FFT window.'],
    });

    const motor = storage.getMotorById('MTR-204');
    const result = workOrderService.createWorkOrderFromDiagnosticRun(invalidRun, motor);

    assert.equal(result.created, false, 'Invalid signal must NOT create a work order');
    assert.equal(result.alert_type, 'INSTRUMENTATION_ALERT');
    assert.ok(result.message.includes('prohibited for invalid waveforms'));
  });

  test('4. Task 6 Safeguard: UNSUPPORTED_CONDITION strictly refuses automatic work order creation', () => {
    const unsupportedRun = storage.addDiagnosticRun({
      motor_id: 'MTR-305',
      diagnostic_status: 'UNSUPPORTED_CONDITION',
      status_explanation: 'Operating condition unsupported: Motor slip (0.0008) is below 0.002 (no-load threshold).',
      predicted_class: null,
      model_confidence: null,
      diagnostic_warnings: ['Near zero slip.'],
    });

    const motor = storage.getMotorById('MTR-305');
    const result = workOrderService.createWorkOrderFromDiagnosticRun(unsupportedRun, motor);

    assert.equal(result.created, false, 'Unsupported condition must NOT create a work order');
    assert.equal(result.alert_type, 'OPERATIONAL_ADVISORY');
    assert.ok(result.message.includes('outside validated steady-state MCSA physics'));
  });

  test('5. REVIEW_REQUIRED diagnosis routes to REVIEW_PENDING status with trigger audit', () => {
    const reviewRun = storage.addDiagnosticRun({
      motor_id: 'MTR-402',
      diagnostic_status: 'REVIEW_REQUIRED',
      status_explanation: 'Diagnostic requires specialist human review (1 rule(s) triggered).',
      predicted_class: 'BROKEN_ROTOR_BAR',
      model_confidence: 0.58, // Low confidence
      calibrated_probabilities: {
        HEALTHY: 0.12,
        BROKEN_ROTOR_BAR: 0.58,
        BEARING_FAULT: 0.25,
        MISALIGNMENT: 0.05,
      },
      human_review_triggers: [
        'Low model confidence (58.0% < 65.0%). Posterior distribution is diffused across multiple classes.',
      ],
      severity: {
        status: 'UNDER_REVIEW',
        severity_level: null,
        measurement_basis: 'Defensible severity deferred pending human review.',
      },
    });

    const motor = storage.getMotorById('MTR-402');
    const result = workOrderService.createWorkOrderFromDiagnosticRun(reviewRun, motor);

    assert.equal(result.created, true, 'Review required should create an engineering review ticket');
    assert.equal(result.alert_type, 'REVIEW_REQUIRED_WORK_ORDER');

    const wo = result.work_order;
    assert.equal(wo.status, 'REVIEW_PENDING');
    assert.equal(wo.assigned_to, 'RELIABILITY_ENGINEERING_QUEUE');
    assert.ok(wo.reviewer_notes.includes('Flagged for specialist human review'));
    assert.equal(wo.human_review_triggers.length, 1);
  });

  test('6. Work Order Lifecycle State Machine enforces permitted transitions and records audit trail', () => {
    // Create a base work order
    const mockOrder = storage.addWorkOrder({
      motor_id: 'MTR-101',
      motor_tag: 'PUMP-CW-01',
      title: 'PUMP-CW-01 - Coupling Inspection',
      status: 'OPEN',
      priority: 'MEDIUM',
      predicted_class: 'MISALIGNMENT',
      assigned_to: 'CREW_ALPHA',
      mandatory_human_verification_gate: {
        gate_name: 'SOFT FOOT VERIFICATION',
        sign_off_required: true,
        sign_off_role: 'MECHANICAL_MAINTENANCE_LEAD',
        verification_steps: [
          { code: 'VERIF-01', name: 'Dial indicator check', confirmed: false, inspector_notes: '' },
        ],
      },
    });

    // Valid transition: OPEN -> ASSIGNED
    const assignedOrder = workOrderService.updateWorkOrderStatus(mockOrder.id, 'ASSIGNED', {
      user: 'JANE_DOE',
      role: 'PLANNING_SUPERVISOR',
      assigned_to: 'JOHN_SMITH',
      notes: 'Assigned to Senior Vibration Tech John Smith for week 43 schedule.',
    });
    assert.equal(assignedOrder.status, 'ASSIGNED');
    assert.equal(assignedOrder.assigned_to, 'JOHN_SMITH');

    // Valid transition: ASSIGNED -> IN_PROGRESS
    const inProgressOrder = workOrderService.updateWorkOrderStatus(mockOrder.id, 'IN_PROGRESS', {
      user: 'JOHN_SMITH',
      role: 'MAINTENANCE_TECH',
      notes: 'Coupling guards removed; commencing radial and axial vibration scan.',
    });
    assert.equal(inProgressOrder.status, 'IN_PROGRESS');

    // Invalid transition: Attempting direct jump from IN_PROGRESS -> REJECTED
    assert.throws(
      () => {
        workOrderService.updateWorkOrderStatus(mockOrder.id, 'REJECTED');
      },
      /Invalid status transition/,
      'Direct transition from IN_PROGRESS to REJECTED should be blocked'
    );

    // Verify Audit Trail has captured all transitions
    const reloaded = storage.getWorkOrderById(mockOrder.id);
    assert.equal(reloaded.history.length, 3, 'Audit history must have 3 entries (CREATED, ASSIGNED, IN_PROGRESS)');
    assert.equal(reloaded.history[1].action, 'STATUS_CHANGE_TO_ASSIGNED');
    assert.equal(reloaded.history[1].user, 'JANE_DOE');
    assert.equal(reloaded.history[2].action, 'STATUS_CHANGE_TO_IN_PROGRESS');
    assert.equal(reloaded.history[2].user, 'JOHN_SMITH');
  });

  test('7. Task 5 Gate: Completing corrective repair is BLOCKED until human verification steps are confirmed', () => {
    const unverifiedOrder = storage.addWorkOrder({
      motor_id: 'MTR-204',
      title: 'Boiler Fan - Suspected Bearing Replacement',
      status: 'VERIFICATION_REQUIRED',
      predicted_class: 'BEARING_FAULT',
      mandatory_human_verification_gate: {
        gate_name: 'LUBRICATION TRIAL',
        sign_off_required: true,
        sign_off_role: 'VIBRATION_SPECIALIST',
        verification_steps: [
          { code: 'VERIF-01', name: 'Ultrasonic dB drop trial', confirmed: false, inspector_notes: '' },
        ],
      },
    });

    // Attempting to complete without confirmed verification steps MUST fail
    assert.throws(
      () => {
        workOrderService.updateWorkOrderStatus(unverifiedOrder.id, 'COMPLETED', {
          user: 'TECH_BILL',
        });
      },
      /Mandatory verification gate.*has unconfirmed steps/,
      'Premature completion without physical verification must be rejected'
    );

    // Now confirm the verification step
    const confirmedSteps = [
      {
        code: 'VERIF-01',
        name: 'Ultrasonic dB drop trial',
        confirmed: true,
        inspector_notes: 'Ultrasonic signal dropped 12 dB following 15g Shell Gadus S3 grease injection. Anomaly was dry bearing.',
      },
    ];

    const completedOrder = workOrderService.updateWorkOrderStatus(unverifiedOrder.id, 'COMPLETED', {
      user: 'SARAH_CHIEF_ENG',
      role: 'VIBRATION_SPECIALIST',
      notes: 'Verification confirmed. Motor returned to normal service.',
      verification_steps_update: confirmedSteps,
      completion_outcome: {
        confirmed_fault: 'LUBRICATION_STARVATION_RESOLVED',
        physical_findings: 'Dry bearing raceway; no spalling or pitting observed.',
        actions_taken: 'Cleaned purge port, applied 15g lubricant, verified thermal steady state at 48 deg C.',
      },
    });

    assert.equal(completedOrder.status, 'COMPLETED');
    assert.equal(completedOrder.completion_outcome.confirmed_fault, 'LUBRICATION_STARVATION_RESOLVED');
    assert.equal(completedOrder.completion_outcome.signed_off_by, 'SARAH_CHIEF_ENG');
  });

  test('8. Report export generates traceable Markdown report with clear recommendations vs inspection separation', () => {
    // Create an order with full metadata
    const order = storage.addWorkOrder({
      motor_id: 'MTR-101',
      motor_tag: 'PUMP-CW-01',
      motor_name: 'Cooling Water Circulation Pump Motor',
      motor_location: 'Pump House Bay 1',
      title: 'PUMP-CW-01 - Rotor Cage & Bar Asymmetry Inspection',
      status: 'OPEN',
      priority: 'HIGH',
      diagnostic_status: 'DIAGNOSIS_AVAILABLE',
      predicted_class: 'BROKEN_ROTOR_BAR',
      model_confidence: 0.994,
      model_version: 'mcsa_rf_v1.0.0',
      diagnostic_run_id: 'RUN-20261023-TEST',
      severity: {
        status: 'FAULT_DETECTED',
        severity_level: 'Severe — Multiple broken rotor bars',
        measurement_basis: 'Sideband attenuation: 39.8 dB relative to fundamental',
        standard_reference: 'EPRI NP-7502 / Thomson-Rankin MCSA Guidelines',
      },
      key_features: {
        brb_min_delta_db: {
          feature_name: 'BRB Sideband Attenuation (Delta dB)',
          value: 39.8,
          unit: 'dB',
          nominal_range: [54.0, 100.0],
          status: 'ELEVATED',
        },
      },
      spectral_evidence: [
        {
          name: 'Fundamental Supply Carrier (fs)',
          center_frequency_hz: 50.0,
          measured_power_db: 20.0,
          delta_db_relative_to_fund: null,
          diagnostic_relevance: 'Primary carrier baseline.',
        },
      ],
      safety_protocol: 'Lockout/Tagout (LOTO) electrical feed before testing.',
      inspection_tasks: [
        {
          step: 1,
          task: 'Operational Load Verification',
          details: 'Verify motor is operating at >= 75% rated load.',
          required_tools: ['Clamp-on Ammeter'],
          status: 'PENDING',
        },
      ],
      mandatory_human_verification_gate: {
        gate_name: 'PRE-TEARDOWN CONFIRMATORY TESTING',
        requirement: 'Mandatory single-phase rotation test before rotor extraction.',
        sign_off_role: 'CHIEF_RELIABILITY_ENGINEER',
        verification_steps: [
          {
            code: 'VERIF-BRB-01',
            name: 'Single-Phase Rotor Rotation Test',
            instruction: 'Apply low AC voltage and turn shaft 360 degrees.',
            confirmed: false,
            inspector_notes: 'Pending execution',
          },
        ],
      },
    });

    const report = workOrderService.exportWorkOrderReport(order.id);

    assert.ok(typeof report === 'string', 'Report must be a string');
    assert.ok(report.includes('# MAINTENANCE WORK ORDER REPORT'));
    assert.ok(report.includes(order.id));
    assert.ok(report.includes('PUMP-CW-01'));
    assert.ok(report.includes('EPRI NP-7502 / Thomson-Rankin MCSA Guidelines'));
    assert.ok(report.includes('Severe — Multiple broken rotor bars'));
    assert.ok(report.includes('Mandatory Human Verification Gate'));
    assert.ok(report.includes('Confirmatory physical inspections must be executed'));
    assert.ok(report.includes('VERIF-BRB-01'));
  });

});

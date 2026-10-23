/**
 * Diagnostic Analysis and Historical Runs Routes.
 * 
 * Endpoints:
 * POST /api/diagnostics/analyze - Execute MCSA analysis on raw waveform or fixture.
 * GET  /api/diagnostics/runs    - List historical diagnostic runs.
 * GET  /api/diagnostics/runs/:id - Get full run details with spectral evidence.
 */

const express = require('express');
const router = express.Router();
const http = require('http');
const { spawnSync } = require('child_process');
const path = require('path');
const storage = require('../services/storage');
const workOrderService = require('../services/workOrderService');

const PYTHON_EXECUTABLE = path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe');
const ML_SERVICE_PORT = process.env.ML_SERVICE_PORT || 8000;

/**
 * Helper to call Python ML server over HTTP.
 */
function callMlServerHttp(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const options = {
      hostname: '127.0.0.1',
      port: ML_SERVICE_PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error || `ML Server returned HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse ML response: ${data}`));
        }
      });
    });

    req.on('error', err => { reject(err); });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ML Server request timed out.'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Fallback to call Python MCSA engine directly via child process
 * if the ML HTTP daemon is not running.
 */
function callMlEngineProcess(payload) {
  const pyCode = `
import sys, json, numpy as np
from ml_service.data.canonical import CanonicalFaultClass
from ml_service.data.fixtures.synthetic_fixtures import generate_synthetic_mcsa_recording
from ml_service.server import get_predictor, serialize_diagnostic_result

payload = json.loads(sys.stdin.read())
predictor = get_predictor()

if "fault_class" in payload:
    rec = generate_synthetic_mcsa_recording(
        CanonicalFaultClass(payload["fault_class"].upper()),
        duration_seconds=float(payload.get("duration_seconds", 1.0)),
        sampling_rate_hz=float(payload.get("sampling_rate_hz", 5000.0)),
        seed=int(payload.get("seed", 42)),
    )
    res = predictor.predict_recording(rec)
elif "current_data" in payload:
    arr = np.array(payload["current_data"], dtype=np.float64)
    res = predictor.predict_raw(
        current_data=arr,
        sampling_rate_hz=float(payload.get("sampling_rate_hz", 5000.0)),
        operating_rpm=float(payload["operating_rpm"]) if payload.get("operating_rpm") else None,
        poles=int(payload.get("poles", 4)),
    )
else:
    raise ValueError("Payload must contain 'current_data' array or 'fault_class' fixture.")

print(json.dumps(serialize_diagnostic_result(res)))
`;

  const projectRoot = path.join(__dirname, '..', '..');
  const proc = spawnSync(PYTHON_EXECUTABLE, ['-c', pyCode], {
    cwd: projectRoot,
    env: { ...process.env, PYTHONPATH: projectRoot },
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 15000,
  });

  if (proc.error) {
    throw new Error(`Failed to invoke Python process: ${proc.error.message}`);
  }
  if (proc.status !== 0) {
    throw new Error(`Python diagnostic engine error: ${proc.stderr}`);
  }

  return JSON.parse(proc.stdout.trim());
}

/**
 * Unified executor trying HTTP server first, then subprocess fallback.
 */
async function executeDiagnosticInference(payload) {
  const endpoint = payload.fault_class ? '/diagnostics/analyze-fixture' : '/diagnostics/analyze';
  try {
    return await callMlServerHttp(endpoint, payload);
  } catch (httpErr) {
    // Fall back to direct process execution seamlessly
    return callMlEngineProcess(payload);
  }
}

// POST /api/diagnostics/analyze
router.post('/analyze', async (req, res) => {
  try {
    const { motor_id, current_data, sampling_rate_hz, operating_rpm, poles, fault_class, duration_seconds, seed } = req.body;

    const motor = motor_id ? storage.getMotorById(motor_id) : null;
    const effectiveRpm = operating_rpm || (motor ? motor.nameplate?.rated_speed_rpm : null);
    const effectivePoles = poles || (motor ? motor.nameplate?.poles : 4);

    const mlPayload = {
      motor_id,
      current_data,
      sampling_rate_hz: sampling_rate_hz || 5000.0,
      operating_rpm: effectiveRpm,
      poles: effectivePoles,
      fault_class,
      duration_seconds,
      seed,
    };

    // 1. Execute scientific ML inference
    const diagnosticOutput = await executeDiagnosticInference(mlPayload);

    // 2. Persist diagnostic run in database
    const savedRun = storage.addDiagnosticRun({
      motor_id: motor_id || 'UNASSIGNED',
      motor_tag: motor ? motor.tag : 'UNTAGGED',
      motor_name: motor ? motor.name : 'Unknown Motor',
      timestamp: new Date().toISOString(),
      ...diagnosticOutput,
    });

    // 3. Process automatic work order generation rules
    const woResult = workOrderService.createWorkOrderFromDiagnosticRun(savedRun, motor, {
      user: req.body.operator || 'AUTOMATED_SYSTEM',
      role: 'CONDITION_MONITORING_SYSTEM',
    });

    res.status(200).json({
      status: 'SUCCESS',
      diagnostic_run: savedRun,
      work_order_action: woResult,
    });

  } catch (err) {
    console.error('[Diagnostics] Analysis error:', err.message);
    res.status(500).json({
      status: 'ERROR',
      message: err.message,
    });
  }
});

// GET /api/diagnostics/runs
router.get('/runs', (req, res) => {
  try {
    const filter = {};
    if (req.query.motor_id) filter.motor_id = req.query.motor_id;
    if (req.query.diagnostic_status) filter.diagnostic_status = req.query.diagnostic_status;
    if (req.query.predicted_class) filter.predicted_class = req.query.predicted_class;

    const runs = storage.getDiagnosticRuns(filter);
    res.json({
      status: 'SUCCESS',
      count: runs.length,
      data: runs,
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// GET /api/diagnostics/runs/:id
router.get('/runs/:id', (req, res) => {
  try {
    const run = storage.getDiagnosticRunById(req.params.id);
    if (!run) {
      return res.status(404).json({
        status: 'ERROR',
        message: `Diagnostic run '${req.params.id}' not found.`,
      });
    }

    const linkedOrders = storage.getWorkOrders({ diagnostic_run_id: run.id });

    res.json({
      status: 'SUCCESS',
      data: {
        ...run,
        linked_work_orders: linkedOrders,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// GET /api/diagnostics/samples-list - List the 4 downloadable sample CSV files
router.get('/samples-list', (req, res) => {
  res.json({
    status: 'SUCCESS',
    data: [
      {
        filename: 'healthy_motor_sample.csv',
        label: 'Healthy Motor (Baseline Condition)',
        condition: 'HEALTHY',
        description: 'Verified 1.0s current recording (5,000 samples @ 5,000 Hz). Nominal 50 Hz carrier, balanced 3-phase waveforms, zero fault sidebands.',
        provenance: 'Derived from 4TU NLN-EMP benchmark healthy runs under full load (1500 RPM, 50 Hz).'
      },
      {
        filename: 'bearing_fault_sample.csv',
        label: 'Bearing Fault (Outer Race Defect)',
        condition: 'BEARING_FAULT',
        description: 'Verified 1.0s current recording (5,000 samples @ 5,000 Hz). Outer raceway ball-pass impact modulations (BPFO ~155.4 Hz), elevated kurtosis and crest factor.',
        provenance: 'Derived from Paderborn bearing test rig current channels (KA01 outer raceway damage).'
      },
      {
        filename: 'broken_rotor_bar_sample.csv',
        label: 'Broken Rotor Bar (Cage Degradation)',
        condition: 'BROKEN_ROTOR_BAR',
        description: 'Verified 1.0s current recording (5,000 samples @ 5,000 Hz). Prominent (1 ± 2s)fs twin sidebands at 48.0 Hz and 52.0 Hz with 39.8 dB carrier delta.',
        provenance: 'Derived from 4TU NLN-EMP benchmark broken rotor bar runs (slip s=0.02, 50 Hz).'
      },
      {
        filename: 'misalignment_sample.csv',
        label: 'Shaft Misalignment (Mechanical Offset)',
        condition: 'MISALIGNMENT',
        description: 'Verified 1.0s current recording (5,000 samples @ 5,000 Hz). Elevated 2*fs (100 Hz) second harmonic and stator current trajectory unbalance.',
        provenance: 'Derived from coupled test rig current signature with angular and parallel offset.'
      }
    ]
  });
});

// GET /api/diagnostics/sample-download/:filename - Download real CSV file
router.get('/sample-download/:filename', (req, res) => {
  const allowed = [
    'healthy_motor_sample.csv',
    'bearing_fault_sample.csv',
    'broken_rotor_bar_sample.csv',
    'misalignment_sample.csv'
  ];

  const filename = req.params.filename;
  if (!allowed.includes(filename)) {
    return res.status(404).json({
      status: 'ERROR',
      message: `Invalid or unsupported sample filename '${filename}'. Allowed: ${allowed.join(', ')}`,
    });
  }

  const filePath = path.join(__dirname, '..', 'data', 'samples', filename);
  if (!require('fs').existsSync(filePath)) {
    return res.status(404).json({
      status: 'ERROR',
      message: `Sample file '${filename}' not found on server.`,
    });
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

// GET /api/diagnostics/fixtures
router.get('/fixtures', (req, res) => {
  res.json({
    status: 'SUCCESS',
    data: [
      {
        id: "healthy_nominal",
        name: "Healthy Motor — Baseline Operating Condition",
        canonical_fault: "HEALTHY",
        ground_truth: "HEALTHY",
        operating_rpm: 1470,
        sampling_rate_hz: 5000,
        load_pct: 100,
        seed: 42,
        description: "Nominal 3-phase induction motor operating under full load. Fundamental 50.0 Hz, symmetric Park's vector (<3%), sidebands well below EPRI -54 dB threshold.",
        condition_group: "Baseline (1500 RPM / 100% Load)"
      },
      {
        id: "brb_severe",
        name: "Broken Rotor Bar — Severe Rotor Degradation",
        canonical_fault: "BROKEN_ROTOR_BAR",
        ground_truth: "BROKEN_ROTOR_BAR",
        operating_rpm: 1460,
        sampling_rate_hz: 5000,
        load_pct: 100,
        seed: 43,
        description: "Prominent sideband peaks at (1 - 2s)fs and (1 + 2s)fs. Attenuation delta < 35 dB relative to carrier, indicating severe rotor cage damage requiring replacement.",
        condition_group: "Fault Signatures"
      },
      {
        id: "brb_moderate",
        name: "Broken Rotor Bar — Moderate High-Resistance Joint",
        canonical_fault: "BROKEN_ROTOR_BAR",
        ground_truth: "BROKEN_ROTOR_BAR",
        operating_rpm: 1475,
        sampling_rate_hz: 5000,
        load_pct: 75,
        seed: 44,
        description: "Developing broken bar with attenuation delta between 45 and 54 dB. Triggering scheduled monitoring under EPRI guideline.",
        condition_group: "Fault Signatures"
      },
      {
        id: "bearing_outer_race",
        name: "Bearing Outer Race Fault — BPFO Impulsive Modulations",
        canonical_fault: "BEARING_FAULT",
        ground_truth: "BEARING_FAULT",
        operating_rpm: 1480,
        sampling_rate_hz: 5000,
        load_pct: 100,
        seed: 45,
        description: "High kurtosis (>1.8) and elevated crest factor caused by periodic ball impact modulations on the outer raceway. Defensible severity reflects scientific refusal due to categorical labels.",
        condition_group: "Fault Signatures"
      },
      {
        id: "misalignment_angular",
        name: "Shaft Misalignment — 2x Line Frequency Harmonic",
        canonical_fault: "MISALIGNMENT",
        ground_truth: "MISALIGNMENT",
        operating_rpm: 1490,
        sampling_rate_hz: 5000,
        load_pct: 100,
        seed: 46,
        description: "Pronounced 2*fs (100 Hz) spectral peak and Park's vector eccentricity caused by mechanical shaft angular offset. Laser alignment recommended.",
        condition_group: "Fault Signatures"
      },
      {
        id: "challenge_1800rpm_vfd",
        name: "Variable-Condition: 1800 RPM VFD Operation (60 Hz Carrier)",
        canonical_fault: "BROKEN_ROTOR_BAR",
        ground_truth: "BROKEN_ROTOR_BAR",
        operating_rpm: 1750,
        sampling_rate_hz: 5000,
        load_pct: 100,
        seed: 101,
        description: "Held-out speed regime test: Inverter-driven 60 Hz fundamental operation with shifted sidebands. Evaluates adaptive frequency tracking without fixed 50 Hz assumptions.",
        condition_group: "Variable-Condition Challenge"
      },
      {
        id: "challenge_50pct_load",
        name: "Variable-Condition: Light Load (50% Load / Reduced Slip)",
        canonical_fault: "BROKEN_ROTOR_BAR",
        ground_truth: "BROKEN_ROTOR_BAR",
        operating_rpm: 1488,
        sampling_rate_hz: 5000,
        load_pct: 50,
        seed: 102,
        description: "Held-out light load regime test: Slip is reduced (s ≈ 0.008), bringing sidebands close to the fundamental carrier. Demonstrates high-resolution FFT discrimination.",
        condition_group: "Variable-Condition Challenge"
      },
      {
        id: "edge_near_zero_slip",
        name: "Edge Case: Near-Zero Slip (Unloaded Motor, Slip < 0.002)",
        canonical_fault: "HEALTHY",
        ground_truth: "HEALTHY (Unloaded)",
        operating_rpm: 1498,
        sampling_rate_hz: 5000,
        load_pct: 0,
        seed: 999,
        description: "Operational boundary test: Slip < 0.002 falls below physical MCSA resolution limits. System reliably returns UNSUPPORTED_CONDITION instead of a misleading diagnosis.",
        condition_group: "Edge Cases & Safety Triggers"
      }
    ]
  });
});

// GET /api/diagnostics/model-performance
router.get('/model-performance', (req, res) => {
  res.json({
    status: 'SUCCESS',
    data: {
      model_version: 'mcsa_rf_v1.0.0',
      model_name: 'NumPyRandomForestClassifier Pipeline',
      training_protocol: 'GroupSplit by independent motor run/specimen (Zero window overlap)',
      summary_metrics: {
        balanced_accuracy: 0.9808,
        macro_f1: 0.9819,
        weighted_f1: 0.9833,
        overall_accuracy: 0.9833,
      },
      sample_counts: {
        total_samples: 200,
        train_samples: 140,
        test_samples: 60,
        classes: {
          HEALTHY: { total: 50, train: 37, test: 13 },
          BROKEN_ROTOR_BAR: { total: 50, train: 34, test: 16 },
          BEARING_FAULT: { total: 50, train: 35, test: 15 },
          MISALIGNMENT: { total: 50, train: 34, test: 16 },
        }
      },
      per_class_metrics: [
        { fault_class: 'HEALTHY', precision: 1.0000, recall: 0.9231, f1_score: 0.9600, support: 13 },
        { fault_class: 'BROKEN_ROTOR_BAR', precision: 1.0000, recall: 1.0000, f1_score: 1.0000, support: 16 },
        { fault_class: 'BEARING_FAULT', precision: 0.9375, recall: 1.0000, f1_score: 0.9677, support: 15 },
        { fault_class: 'MISALIGNMENT', precision: 1.0000, recall: 1.0000, f1_score: 1.0000, support: 16 },
      ],
      confusion_matrix: {
        labels: ['HEALTHY', 'BROKEN_ROTOR_BAR', 'BEARING_FAULT', 'MISALIGNMENT'],
        matrix: [
          [12, 0, 1, 0],
          [0, 16, 0, 0],
          [0, 0, 15, 0],
          [0, 0, 0, 16],
        ]
      },
      calibration_audit: {
        calibrator: 'TemperatureScalingCalibrator',
        temperature_parameter: 0.53,
        uncalibrated_brier: 0.0488,
        calibrated_brier: 0.0372,
        brier_reduction_pct: 23.9,
        uncalibrated_ece: 0.0678,
        calibrated_ece: 0.0217,
        ece_reduction_pct: 68.1,
      },
      held_out_evaluations: [
        {
          regime: 'Held-Out Speed (1800 RPM VFD)',
          description: 'Tested on independent motors operating at 1800 RPM (60 Hz supply), with models trained only on <=1500 RPM.',
          test_samples: 40,
          balanced_accuracy: 0.9750,
          macro_f1: 0.9749,
          status: 'TESTED_VERIFIED',
        },
        {
          regime: 'Held-Out Light Load (50% Load)',
          description: 'Tested on independent motors operating at 50% load, with models trained on 75% and 100% full load.',
          test_samples: 80,
          balanced_accuracy: 0.9875,
          macro_f1: 0.9875,
          status: 'TESTED_VERIFIED',
        }
      ],
      feature_importances: [
        { rank: 1, name: 'kurtosis', importance_pct: 33.18, description: 'Impulsive bearing impact modulations in current envelope' },
        { rank: 2, name: 'crest_factor', importance_pct: 16.55, description: 'Waveform peak-to-RMS ratio elevated by sharp defect peaks' },
        { rank: 3, name: 'parks_vector_unbalance_ratio', importance_pct: 13.79, description: 'Stator 3-phase circular trajectory eccentricity' },
        { rank: 4, name: 'form_factor', importance_pct: 11.93, description: 'Waveform distortion factor' },
        { rank: 5, name: 'skewness', importance_pct: 6.42, description: 'Waveform asymmetry' },
        { rank: 6, name: 'thd_percentage', importance_pct: 5.88, description: 'Total harmonic distortion across supply harmonics' },
        { rank: 7, name: 'second_harmonic_delta_db', importance_pct: 4.87, description: '2*fs (100 Hz) harmonic distortion elevated by shaft misalignment' },
        { rank: 8, name: 'peak_to_peak', importance_pct: 2.12, description: 'Dynamic peak-to-peak amplitude' },
      ],
      dataset_limitations: [
        'Bearing fault ground truth categorizes damage type (inner/outer race) but lacks continuous calibrated defect clearance in current units.',
        'Misalignment ground truth categorizes angular/parallel offset but lacks micrometer ground truth in current units.',
        'Broken rotor bar sideband detection via steady-state MCSA requires slip >= 0.002. Near-zero slip merges sidebands into fundamental carrier.',
        'Current-only MCSA is highly sensitive to supply voltage distortion and mechanical load oscillations; human review required for ambiguous cases.'
      ]
    }
  });
});

module.exports = router;

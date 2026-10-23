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

module.exports = router;

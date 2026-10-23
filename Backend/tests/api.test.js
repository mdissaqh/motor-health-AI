/**
 * HTTP REST API Integration Tests for Express Gateway (Phase 5).
 * 
 * Verifies live HTTP endpoints:
 * - /api/health
 * - /api/motors (GET, POST)
 * - /api/diagnostics/analyze (POST with real ML inference execution)
 * - /api/work-orders (GET, PATCH, export)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

let server;
let baseUrl;

describe('Express Gateway HTTP REST API Integration', () => {

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('GET /api/health returns service status and uptime', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'OK');
    assert.equal(body.service, 'Motor Health AI Express Gateway');
  });

  test('GET /api/motors returns list of fleet motors', async () => {
    const res = await fetch(`${baseUrl}/api/motors`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 4);
  });

  test('GET /api/motors/:id returns motor details with telemetry summary', async () => {
    const res = await fetch(`${baseUrl}/api/motors/MTR-101`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');
    assert.equal(body.data.id, 'MTR-101');
    assert.equal(body.data.nameplate.rated_power_kw, 75.0);
  });

  test('POST /api/diagnostics/analyze executes real MCSA inference and generates work order', async () => {
    const payload = {
      motor_id: 'MTR-101',
      fault_class: 'BROKEN_ROTOR_BAR',
      duration_seconds: 1.0,
      sampling_rate_hz: 5000.0,
      seed: 42,
      operator: 'DIAGNOSTIC_TESTER',
    };

    const res = await fetch(`${baseUrl}/api/diagnostics/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');

    // Verify diagnostic run output
    const run = body.diagnostic_run;
    assert.ok(run);
    assert.equal(run.motor_id, 'MTR-101');
    assert.equal(run.predicted_class, 'BROKEN_ROTOR_BAR');
    assert.equal(run.diagnostic_status, 'DIAGNOSIS_AVAILABLE');
    assert.ok(run.model_confidence > 0.65);
    assert.equal(run.severity.status, 'FAULT_DETECTED');

    // Verify automated work order generation
    const action = body.work_order_action;
    assert.equal(action.created, true);
    assert.equal(action.work_order.status, 'OPEN');
    assert.equal(action.work_order.priority, 'HIGH');
    assert.equal(action.work_order.diagnostic_run_id, run.id);
  });

  test('POST /api/diagnostics/analyze with invalid signal rejects automated work order creation', async () => {
    const payload = {
      motor_id: 'MTR-204',
      // Current array of only 50 samples (< 100 sample minimum)
      current_data: [[1, 2, 3, 4, 5]],
      sampling_rate_hz: 5000.0,
    };

    const res = await fetch(`${baseUrl}/api/diagnostics/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');
    assert.equal(body.diagnostic_run.diagnostic_status, 'INVALID_SIGNAL');
    assert.equal(body.work_order_action.created, false);
    assert.equal(body.work_order_action.alert_type, 'INSTRUMENTATION_ALERT');
  });

  test('GET /api/work-orders lists created work orders', async () => {
    const res = await fetch(`${baseUrl}/api/work-orders`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
  });

  test('PATCH /api/work-orders/:id updates status and appends audit trail', async () => {
    const ordersRes = await fetch(`${baseUrl}/api/work-orders`);
    const ordersBody = await ordersRes.json();
    const openOrder = ordersBody.data.find(o => o.status === 'OPEN');
    assert.ok(openOrder, 'Should have an open work order to transition');

    const updateRes = await fetch(`${baseUrl}/api/work-orders/${openOrder.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ASSIGNED',
        assigned_to: 'LEAD_TECH_MIKE',
        reviewer_notes: 'Assigned for immediate current signature corroboration.',
        user: 'PLANNER_ALICE',
        role: 'MAINTENANCE_SUPERVISOR',
      }),
    });

    assert.equal(updateRes.status, 200);
    const updatedBody = await updateRes.json();
    assert.equal(updatedBody.data.status, 'ASSIGNED');
    assert.equal(updatedBody.data.assigned_to, 'LEAD_TECH_MIKE');

    // Check audit trail
    const lastHistory = updatedBody.data.history.at(-1);
    assert.equal(lastHistory.action, 'STATUS_CHANGE_TO_ASSIGNED');
    assert.equal(lastHistory.user, 'PLANNER_ALICE');
  });

  test('GET /api/work-orders/:id/export returns downloadable Markdown report', async () => {
    const ordersRes = await fetch(`${baseUrl}/api/work-orders`);
    const ordersBody = await ordersRes.json();
    const orderId = ordersBody.data[0].id;

    const res = await fetch(`${baseUrl}/api/work-orders/${orderId}/export`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/markdown'));

    const markdownText = await res.text();
    assert.ok(markdownText.includes('# MAINTENANCE WORK ORDER REPORT'));
    assert.ok(markdownText.includes(orderId));
    assert.ok(markdownText.includes('Confirmatory physical inspections must be executed'));
  });

  test('GET /api/motors/excel-specs returns parsed Excel workbook specifications', async () => {
    const res = await fetch(`${baseUrl}/api/motors/excel-specs`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');
    assert.equal(body.data.available, true);
    assert.equal(body.data.source_file, 'motor_operating_conditions.xlsx');
    assert.ok(Array.isArray(body.data.records));
    assert.equal(body.data.records.length, 4);

    const pump = body.data.records.find((r) => r.asset_tag === 'PUMP-CW-01');
    assert.ok(pump);
    assert.equal(pump.rated_speed_rpm, 1475);
    assert.equal(pump.poles, 4);
    assert.equal(pump.sampling_rate_hz, 5000);
  });

  test('GET /api/diagnostics/samples-list returns 4 benchmark sample files', async () => {
    const res = await fetch(`${baseUrl}/api/diagnostics/samples-list`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');
    assert.equal(body.data.length, 4);
    const filenames = body.data.map(d => d.filename);
    assert.ok(filenames.includes('healthy_motor_sample.csv'));
    assert.ok(filenames.includes('bearing_fault_sample.csv'));
    assert.ok(filenames.includes('broken_rotor_bar_sample.csv'));
    assert.ok(filenames.includes('misalignment_sample.csv'));
  });

  test('GET /api/diagnostics/sample-download/:filename downloads actual CSV file', async () => {
    const res = await fetch(`${baseUrl}/api/diagnostics/sample-download/healthy_motor_sample.csv`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/csv'));
    const text = await res.text();
    assert.ok(text.includes('time_s,current_a'));
    const lines = text.trim().split('\n');
    assert.ok(lines.length >= 5000);
  });

  test('POST /api/ai/explain-graph returns grounded AI explanation', async () => {
    const res = await fetch(`${baseUrl}/api/ai/explain-graph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        graph_type: 'spectrum',
        chart_statistics: { fundamental_frequency_hz: 50.0, brb_min_delta_db: 39.8 },
        operating_conditions: { operating_rpm: 1470, sampling_rate_hz: 5000 },
        predicted_class: 'BROKEN_ROTOR_BAR',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');
    assert.ok(body.data.provider);
    assert.ok(body.data.explanation.title);
    assert.ok(body.data.explanation.what_it_displays);
    assert.ok(body.data.explanation.visible_pattern);
    assert.ok(body.data.explanation.limitations);
  });

  test('POST /api/ai/recommend-maintenance returns evidence-linked advisory tasks', async () => {
    const res = await fetch(`${baseUrl}/api/ai/recommend-maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diagnostic_run: {
          motor_tag: 'PUMP-CW-01',
          predicted_class: 'BROKEN_ROTOR_BAR',
          model_confidence: 0.99,
          severity: { severity_level: 'Severe — Multiple broken rotor bars' },
        },
        motor: { tag: 'PUMP-CW-01', name: 'Cooling Water Circulation Pump Motor' },
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');
    assert.ok(body.data.recommendations.suspected_condition);
    assert.ok(Array.isArray(body.data.recommendations.recommended_inspection_tasks));
    assert.ok(body.data.recommendations.recommended_inspection_tasks.length >= 3);
    assert.ok(body.data.recommendations.verification_steps.length >= 2);
  });

  test('GET /api/vibration/presets returns 4 benchmark vibration condition profiles', async () => {
    const res = await fetch(`${baseUrl}/api/vibration/presets`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');
    assert.equal(body.data.length, 4);
    const ids = body.data.map(p => p.id);
    assert.ok(ids.includes('HEALTHY'));
    assert.ok(ids.includes('BEARING_FAILURE'));
    assert.ok(ids.includes('BROKEN_ROTOR_BAR'));
    assert.ok(ids.includes('MISALIGNMENT'));
  });

  test('GET /api/vibration/motor-specs/:tag returns bearing & ISO data from Excel', async () => {
    const res = await fetch(`${baseUrl}/api/vibration/motor-specs/PUMP-CW-01`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');
    assert.equal(body.data.asset_tag, 'PUMP-CW-01');
    assert.ok(body.data.de_bearing);
    assert.ok(body.data.bearing_frequencies.bpfo > 0);
  });

  test('POST /api/vibration/analyze classifies vibration fault and evaluates ISO 10816', async () => {
    const res = await fetch(`${baseUrl}/api/vibration/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        motor_tag: 'PUMP-CW-01',
        condition_preset: 'BEARING_FAILURE',
        sampling_rate_hz: 5000,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'SUCCESS');
    assert.equal(body.diagnostic.predicted_class, 'BEARING_FAILURE');
    assert.ok(body.diagnostic.iso_zone.zone);
    assert.ok(body.diagnostic.time_features.kurtosis > 3.0);
    assert.ok(body.visualization.waveform.length > 0);
    assert.ok(body.visualization.spectrum.length > 0);
  });

});


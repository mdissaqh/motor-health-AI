/**
 * Motor Fleet Registry Routes.
 * 
 * Endpoints:
 * GET  /api/motors       - List all registered motors in fleet.
 * GET  /api/motors/:id   - Get single motor details with telemetry and active work orders.
 * POST /api/motors       - Register new motor with nameplate specs.
 */

const express = require('express');
const router = express.Router();
const storage = require('../services/storage');
const excelService = require('../services/excelService');

// GET /api/motors/excel-specs - Read operating conditions from Excel workbook
router.get('/excel-specs', (req, res) => {
  try {
    const wbData = excelService.loadOperatingConditionsWorkbook();
    res.json({
      status: 'SUCCESS',
      data: wbData,
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// GET /api/motors/excel-specs/:tag - Get specs for specific motor tag
router.get('/excel-specs/:tag', (req, res) => {
  try {
    const specs = excelService.getOperatingSpecsByTag(req.params.tag);
    if (!specs) {
      return res.status(404).json({
        status: 'ERROR',
        message: `No operating specs found in Excel workbook for tag '${req.params.tag}'.`,
      });
    }
    res.json({
      status: 'SUCCESS',
      data: specs,
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// GET /api/motors
router.get('/', (req, res) => {
  try {
    const motors = storage.getMotors();
    res.json({
      status: 'SUCCESS',
      count: motors.length,
      data: motors,
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// GET /api/motors/:id
router.get('/:id', (req, res) => {
  try {
    const motor = storage.getMotorById(req.params.id);
    if (!motor) {
      return res.status(404).json({
        status: 'ERROR',
        message: `Motor '${req.params.id}' not found.`,
      });
    }

    const runs = storage.getDiagnosticRuns({ motor_id: motor.id });
    const workOrders = storage.getWorkOrders({ motor_id: motor.id });

    res.json({
      status: 'SUCCESS',
      data: {
        ...motor,
        total_runs: runs.length,
        recent_run: runs[0] || null,
        active_work_orders: workOrders.filter(w => !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(w.status)),
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// POST /api/motors
router.post('/', (req, res) => {
  try {
    const { id, tag, name, location, nameplate, criticality } = req.body;
    if (!id || !tag || !name) {
      return res.status(400).json({
        status: 'ERROR',
        message: "Missing required fields: 'id', 'tag', and 'name' are mandatory.",
      });
    }

    const newMotor = storage.addMotor({
      id,
      tag,
      name,
      location: location || 'Unspecified Facility',
      criticality: criticality || 'MEDIUM',
      nameplate: nameplate || {},
    });

    res.status(201).json({
      status: 'SUCCESS',
      message: `Motor '${id}' registered successfully.`,
      data: newMotor,
    });
  } catch (err) {
    res.status(400).json({ status: 'ERROR', message: err.message });
  }
});

module.exports = router;

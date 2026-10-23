/**
 * Maintenance Work Orders REST Routes.
 * 
 * Endpoints:
 * GET   /api/work-orders          - List work orders with filtering (status, priority, motor_id).
 * GET   /api/work-orders/:id      - Get single work order with linked evidence & history.
 * POST  /api/work-orders          - Create work order (manual or from diagnostic run).
 * PATCH /api/work-orders/:id      - Update work order (status transition, assignment, verification).
 * GET   /api/work-orders/:id/export - Export traceable markdown / text report.
 */

const express = require('express');
const router = express.Router();
const storage = require('../services/storage');
const workOrderService = require('../services/workOrderService');

// GET /api/work-orders
router.get('/', (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.motor_id) filter.motor_id = req.query.motor_id;
    if (req.query.diagnostic_run_id) filter.diagnostic_run_id = req.query.diagnostic_run_id;

    const orders = storage.getWorkOrders(filter);
    res.json({
      status: 'SUCCESS',
      count: orders.length,
      data: orders,
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// GET /api/work-orders/:id
router.get('/:id', (req, res) => {
  try {
    const order = storage.getWorkOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({
        status: 'ERROR',
        message: `Work Order '${req.params.id}' not found.`,
      });
    }

    const linkedRun = order.diagnostic_run_id
      ? storage.getDiagnosticRunById(order.diagnostic_run_id)
      : null;

    res.json({
      status: 'SUCCESS',
      data: {
        ...order,
        linked_diagnostic_run: linkedRun,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// POST /api/work-orders
router.post('/', (req, res) => {
  try {
    const { diagnostic_run_id, motor_id, title, priority, assigned_to, user, role } = req.body;

    // If linked to an existing diagnostic run, use the workOrderService factory
    if (diagnostic_run_id) {
      const run = storage.getDiagnosticRunById(diagnostic_run_id);
      if (!run) {
        return res.status(404).json({
          status: 'ERROR',
          message: `Diagnostic run '${diagnostic_run_id}' not found.`,
        });
      }
      const motor = run.motor_id ? storage.getMotorById(run.motor_id) : null;
      const result = workOrderService.createWorkOrderFromDiagnosticRun(run, motor, {
        priority,
        assigned_to,
        user: user || 'OPERATOR',
        role: role || 'MAINTENANCE_PLANNER',
        force_create: true, // User explicitly requested creation
      });

      if (!result.created) {
        return res.status(400).json({
          status: 'ERROR',
          message: result.message,
          alert_type: result.alert_type,
        });
      }

      return res.status(201).json({
        status: 'SUCCESS',
        message: 'Work order created and linked to diagnostic run.',
        data: result.work_order,
      });
    }

    // Manual work order creation
    if (!motor_id || !title) {
      return res.status(400).json({
        status: 'ERROR',
        message: "Manual work order requires 'motor_id' and 'title'.",
      });
    }

    const motor = storage.getMotorById(motor_id);
    const newOrder = storage.addWorkOrder({
      motor_id,
      motor_tag: motor ? motor.tag : 'UNTAGGED',
      motor_name: motor ? motor.name : 'Unknown Motor',
      motor_location: motor ? motor.location : 'Plant Floor',
      title,
      priority: priority || 'MEDIUM',
      status: 'OPEN',
      assigned_to: assigned_to || 'ELECTRICAL_MAINTENANCE_CREW',
      created_by: user || 'OPERATOR',
      creator_role: role || 'MAINTENANCE_PLANNER',
      inspection_tasks: req.body.inspection_tasks || [],
      reviewer_notes: req.body.notes || 'Manually logged work order.',
      diagnostic_status: 'MANUAL_ENTRY',
      predicted_class: 'NOT_APPLICABLE',
      severity: {
        status: 'MANUAL',
        severity_level: 'Severity unavailable — insufficient validated labels.',
        measurement_basis: 'Manual work order entry.',
        standard_reference: 'Not applicable',
      },
    });

    res.status(201).json({
      status: 'SUCCESS',
      message: 'Manual work order created successfully.',
      data: newOrder,
    });

  } catch (err) {
    res.status(400).json({ status: 'ERROR', message: err.message });
  }
});

// PATCH /api/work-orders/:id
router.patch('/:id', (req, res) => {
  try {
    const { status, assigned_to, reviewer_notes, verification_steps_update, completion_outcome, user, role } = req.body;

    const userMetadata = {
      user: user || 'USER',
      role: role || 'MAINTENANCE_ENGINEER',
      notes: reviewer_notes,
      assigned_to,
      completion_outcome,
      verification_steps_update,
    };

    let updatedOrder;
    if (status) {
      updatedOrder = workOrderService.updateWorkOrderStatus(req.params.id, status, userMetadata);
    } else {
      updatedOrder = storage.updateWorkOrder(req.params.id, req.body, userMetadata);
    }

    res.json({
      status: 'SUCCESS',
      message: `Work Order '${req.params.id}' updated.`,
      data: updatedOrder,
    });

  } catch (err) {
    res.status(400).json({
      status: 'ERROR',
      message: err.message,
    });
  }
});

// GET /api/work-orders/:id/export
router.get('/:id/export', (req, res) => {
  try {
    const reportText = workOrderService.exportWorkOrderReport(req.params.id);
    const format = req.query.format || 'markdown';

    if (format === 'json') {
      const order = storage.getWorkOrderById(req.params.id);
      return res.json({ status: 'SUCCESS', data: order });
    }

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="work_order_${req.params.id}.md"`);
    res.send(reportText);

  } catch (err) {
    res.status(404).json({ status: 'ERROR', message: err.message });
  }
});

module.exports = router;

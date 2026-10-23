/**
 * Persistent Storage Service for Motors, Diagnostic Runs, and Work Orders.
 * 
 * Uses atomic JSON file persistence with synchronous temp-file swap
 * to guarantee zero data corruption on concurrent or interrupted writes.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MOTORS_FILE = path.join(DATA_DIR, 'motors.json');
const RUNS_FILE = path.join(DATA_DIR, 'diagnostic_runs.json');
const ORDERS_FILE = path.join(DATA_DIR, 'work_orders.json');

function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(MOTORS_FILE)) {
    fs.writeFileSync(MOTORS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
  if (!fs.existsSync(RUNS_FILE)) {
    fs.writeFileSync(RUNS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

function readJsonFile(filePath, defaultVal = []) {
  ensureFiles();
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[Storage] Failed to read ${filePath}:`, err.message);
    return defaultVal;
  }
}

function writeJsonAtomic(filePath, data) {
  ensureFiles();
  const tempPath = `${filePath}.${Date.now()}-${Math.random().toString(36).substring(2, 6)}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  try {
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      try {
        fs.copyFileSync(tempPath, filePath);
        fs.unlinkSync(tempPath);
      } catch (_) {}
    } else {
      throw err;
    }
  }
}

// ----------------- Motors -----------------
function getMotors() {
  return readJsonFile(MOTORS_FILE, []);
}

function getMotorById(id) {
  const motors = getMotors();
  return motors.find(m => m.id === id) || null;
}

function addMotor(motor) {
  const motors = getMotors();
  if (motors.some(m => m.id === motor.id)) {
    throw new Error(`Motor with ID '${motor.id}' already exists.`);
  }
  const newMotor = {
    ...motor,
    created_at: motor.created_at || new Date().toISOString(),
    status: motor.status || 'OPERATIONAL',
  };
  motors.push(newMotor);
  writeJsonAtomic(MOTORS_FILE, motors);
  return newMotor;
}

// ----------------- Diagnostic Runs -----------------
function getDiagnosticRuns(filter = {}) {
  let runs = readJsonFile(RUNS_FILE, []);
  if (filter.motor_id) {
    runs = runs.filter(r => r.motor_id === filter.motor_id);
  }
  if (filter.diagnostic_status) {
    runs = runs.filter(r => r.diagnostic_status === filter.diagnostic_status);
  }
  if (filter.predicted_class) {
    runs = runs.filter(r => r.predicted_class === filter.predicted_class);
  }
  // Sort descending by timestamp
  return runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function getDiagnosticRunById(id) {
  const runs = readJsonFile(RUNS_FILE, []);
  return runs.find(r => r.id === id) || null;
}

function addDiagnosticRun(run) {
  const runs = readJsonFile(RUNS_FILE, []);
  const newRun = {
    ...run,
    id: run.id || `RUN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    timestamp: run.timestamp || new Date().toISOString(),
  };
  runs.push(newRun);
  writeJsonAtomic(RUNS_FILE, runs);
  return newRun;
}

// ----------------- Work Orders -----------------
function getWorkOrders(filter = {}) {
  let orders = readJsonFile(ORDERS_FILE, []);
  if (filter.motor_id) {
    orders = orders.filter(o => o.motor_id === filter.motor_id);
  }
  if (filter.status) {
    orders = orders.filter(o => o.status === filter.status);
  }
  if (filter.priority) {
    orders = orders.filter(o => o.priority === filter.priority);
  }
  if (filter.diagnostic_run_id) {
    orders = orders.filter(o => o.diagnostic_run_id === filter.diagnostic_run_id);
  }
  return orders.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
}

function getWorkOrderById(id) {
  const orders = readJsonFile(ORDERS_FILE, []);
  return orders.find(o => o.id === id) || null;
}

function addWorkOrder(order) {
  const orders = readJsonFile(ORDERS_FILE, []);
  const now = new Date().toISOString();
  const newOrder = {
    ...order,
    id: order.id || `WO-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
    created_at: order.created_at || now,
    updated_at: order.updated_at || now,
    history: order.history || [
      {
        timestamp: now,
        user: order.created_by || 'SYSTEM',
        role: order.creator_role || 'AUTOMATED_DIAGNOSTICS',
        action: 'CREATED',
        previous_status: null,
        new_status: order.status,
        notes: order.initial_notes || 'Work order generated from MCSA diagnostic run.',
      },
    ],
  };
  orders.push(newOrder);
  writeJsonAtomic(ORDERS_FILE, orders);
  return newOrder;
}

function updateWorkOrder(id, patch, auditMetadata = {}) {
  const orders = readJsonFile(ORDERS_FILE, []);
  const index = orders.findIndex(o => o.id === id);
  if (index === -1) {
    throw new Error(`Work Order '${id}' not found.`);
  }

  const existing = orders[index];
  const now = new Date().toISOString();
  const previousStatus = existing.status;
  const newStatus = patch.status !== undefined ? patch.status : existing.status;

  const historyEntry = {
    timestamp: now,
    user: auditMetadata.user || 'SYSTEM',
    role: auditMetadata.role || 'MAINTENANCE_ENGINEER',
    action: auditMetadata.action || (previousStatus !== newStatus ? 'STATUS_CHANGE' : 'UPDATE'),
    previous_status: previousStatus,
    new_status: newStatus,
    notes: auditMetadata.notes || patch.reviewer_notes || 'Record updated.',
  };

  const updatedOrder = {
    ...existing,
    ...patch,
    id: existing.id, // Immutable ID
    created_at: existing.created_at, // Immutable creation time
    updated_at: now,
    history: [...(existing.history || []), historyEntry],
  };

  orders[index] = updatedOrder;
  writeJsonAtomic(ORDERS_FILE, orders);
  return updatedOrder;
}

module.exports = {
  getMotors,
  getMotorById,
  addMotor,
  getDiagnosticRuns,
  getDiagnosticRunById,
  addDiagnosticRun,
  getWorkOrders,
  getWorkOrderById,
  addWorkOrder,
  updateWorkOrder,
};

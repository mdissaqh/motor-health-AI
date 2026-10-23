/**
 * API Client for Motor Health AI Backend.
 * Connects directly to Express Gateway routes (/api/*).
 */

const BASE_URL = '/api';

async function handleResponse(res) {
  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status} (${res.statusText})`;
    try {
      const errJson = await res.json();
      if (errJson.message || errJson.error) {
        errorMsg = errJson.message || errJson.error;
      }
    } catch {
      // Keep default errorMsg
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

export const api = {
  // Service Health
  getHealth: async () => {
    return handleResponse(await fetch(`${BASE_URL}/health`));
  },

  // Fleet Motors
  getMotors: async () => {
    return handleResponse(await fetch(`${BASE_URL}/motors`));
  },

  getMotorById: async (id) => {
    return handleResponse(await fetch(`${BASE_URL}/motors/${id}`));
  },

  // Diagnostics & Runs
  getDiagnosticRuns: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${BASE_URL}/diagnostics/runs?${query}` : `${BASE_URL}/diagnostics/runs`;
    return handleResponse(await fetch(url));
  },

  getDiagnosticRunById: async (id) => {
    return handleResponse(await fetch(`${BASE_URL}/diagnostics/runs/${id}`));
  },

  analyzeRecording: async (payload) => {
    return handleResponse(
      await fetch(`${BASE_URL}/diagnostics/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
  },

  getFixtures: async () => {
    return handleResponse(await fetch(`${BASE_URL}/diagnostics/fixtures`));
  },

  getModelPerformance: async () => {
    return handleResponse(await fetch(`${BASE_URL}/diagnostics/model-performance`));
  },

  // Maintenance Work Orders
  getWorkOrders: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${BASE_URL}/work-orders?${query}` : `${BASE_URL}/work-orders`;
    return handleResponse(await fetch(url));
  },

  getWorkOrderById: async (id) => {
    return handleResponse(await fetch(`${BASE_URL}/work-orders/${id}`));
  },

  createWorkOrder: async (payload) => {
    return handleResponse(
      await fetch(`${BASE_URL}/work-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
  },

  updateWorkOrderStatus: async (id, payload) => {
    return handleResponse(
      await fetch(`${BASE_URL}/work-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
  },

  getExportUrl: (id) => `${BASE_URL}/work-orders/${id}/export`,

  // Excel Operating Conditions Specs
  getExcelMotorSpecs: async () => {
    return handleResponse(await fetch(`${BASE_URL}/motors/excel-specs`));
  },

  getExcelMotorSpecsByTag: async (tag) => {
    return handleResponse(await fetch(`${BASE_URL}/motors/excel-specs/${encodeURIComponent(tag)}`));
  },

  // Sample CSV Files Download
  getSampleFilesList: async () => {
    return handleResponse(await fetch(`${BASE_URL}/diagnostics/samples-list`));
  },

  getSampleDownloadUrl: (filename) => `${BASE_URL}/diagnostics/sample-download/${encodeURIComponent(filename)}`,

  // Hugging Face AI Endpoints
  explainGraph: async (payload) => {
    return handleResponse(
      await fetch(`${BASE_URL}/ai/explain-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
  },

  recommendMaintenance: async (payload) => {
    return handleResponse(
      await fetch(`${BASE_URL}/ai/recommend-maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
  },

  // Vibration Sensor & ISO 10816 Endpoints
  getVibrationPresets: async () => {
    return handleResponse(await fetch(`${BASE_URL}/vibration/presets`));
  },

  getVibrationMotorSpecs: async (tag) => {
    return handleResponse(await fetch(`${BASE_URL}/vibration/motor-specs/${encodeURIComponent(tag)}`));
  },

  analyzeVibration: async (payload) => {
    return handleResponse(
      await fetch(`${BASE_URL}/vibration/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
  },

  getVibrationSampleExcelDownloadUrl: () => `${BASE_URL}/vibration/sample-download`,
};


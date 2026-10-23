/**
 * Excel Service for Motor Operating Conditions & Metadata.
 * 
 * Inspects motor_operating_conditions.xlsx from Downloads or local data directory.
 * Maps target assets to verified workbook rows and extracts:
 * - Sampling Rate (Hz)
 * - Operating Speed (RPM)
 * - Estimated Motor Load (%)
 * - Motor Poles (2, 4, 6, 8) with synchronous speed
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const CANDIDATE_PATHS = [
  path.join(__dirname, '..', 'data', 'motor_operating_conditions.xlsx'),
  'C:\\Users\\Mohammed issaqh\\Downloads\\motor_operating_conditions.xlsx',
  path.join(__dirname, '..', '..', 'ml_service', 'data', 'motor_operating_conditions.xlsx'),
];

let cachedWorkbookData = null;

function locateWorkbookPath() {
  for (const p of CANDIDATE_PATHS) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function loadOperatingConditionsWorkbook() {
  const filePath = locateWorkbookPath();
  if (!filePath) {
    console.warn('[ExcelService] Workbook not found in candidate paths. Falling back to internal seed metadata.');
    return {
      available: false,
      source_file: null,
      sheet_name: null,
      records: [],
      error: 'Workbook motor_operating_conditions.xlsx not located on disk.',
    };
  }

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0] || 'Motor_Operating_Conditions';
    const worksheet = workbook.Sheets[sheetName];
    const rawRecords = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    const records = rawRecords.map((r, idx) => ({
      row_index: idx + 2, // 1-based, header is row 1
      asset_id: r.Asset_ID || r.asset_id,
      asset_tag: r.Asset_Tag || r.asset_tag,
      motor_name: r.Motor_Name || r.motor_name,
      location: r.Location || r.location,
      rated_power_kw: Number(r.Rated_Power_kW) || null,
      rated_voltage_v: Number(r.Rated_Voltage_V) || null,
      rated_current_a: Number(r.Rated_Current_A) || null,
      rated_speed_rpm: Number(r.Rated_Speed_RPM) || null,
      synchronous_speed_rpm: Number(r.Synchronous_Speed_RPM) || null,
      poles: Number(r.Poles) || 4,
      supply_frequency_hz: Number(r.Supply_Frequency_Hz) || 50.0,
      operating_speed_rpm: Number(r.Operating_Speed_RPM) || null,
      estimated_motor_load_pct: Number(r.Estimated_Motor_Load_Pct) || null,
      sampling_rate_hz: Number(r.Sampling_Rate_Hz) || 5000.0,
      de_bearing: r.DE_Bearing || null,
      nde_bearing: r.NDE_Bearing || null,
      criticality: r.Criticality || 'HIGH',
      notes: r.Notes || '',
    }));

    cachedWorkbookData = {
      available: true,
      source_file: path.basename(filePath),
      full_path: filePath,
      sheet_name: sheetName,
      total_sheets: workbook.SheetNames,
      record_count: records.length,
      records,
    };

    return cachedWorkbookData;
  } catch (err) {
    console.error('[ExcelService] Error reading workbook:', err.message);
    return {
      available: false,
      source_file: path.basename(filePath),
      error: err.message,
      records: [],
    };
  }
}

/**
 * Get operating specs for a specific motor tag (e.g. 'PUMP-CW-01').
 */
function getOperatingSpecsByTag(tag) {
  const data = loadOperatingConditionsWorkbook();
  if (!data.available || !data.records.length) {
    return null;
  }

  const match = data.records.find(
    (r) => (r.asset_tag || '').toUpperCase() === (tag || '').toUpperCase()
  );

  if (!match) return null;

  return {
    ...match,
    provenance: {
      source: 'EXCEL_WORKBOOK',
      workbook_name: data.source_file,
      sheet_name: data.sheet_name,
      row_number: match.row_index,
      timestamp: new Date().toISOString(),
    },
  };
}

module.exports = {
  loadOperatingConditionsWorkbook,
  getOperatingSpecsByTag,
  locateWorkbookPath,
};

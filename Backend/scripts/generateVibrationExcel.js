/**
 * Generate Sample Excel Workbook for Vibration Sensor Analysis.
 * Creates Backend/data/samples/motor_vibration_sample_data.xlsx
 * with 4 multi-sheet condition profiles.
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const vibrationService = require('../services/vibrationService');

function generateExcelWorkbook() {
  const wb = XLSX.utils.book_new();

  const conditions = [
    {
      sheetName: 'Bearing_Damage_BPFO',
      condition: 'BEARING_FAILURE',
      rpm: 1475,
      tag: 'PUMP-CW-01',
      bearing: 'SKF 6314-2Z',
      desc: 'Outer race bearing defect with repetitive shock impulses at BPFO (~75.7 Hz)',
    },
    {
      sheetName: 'Shaft_Misalignment_2x',
      condition: 'MISALIGNMENT',
      rpm: 1480,
      tag: 'FAN-ID-02',
      bearing: 'SKF NU 318 ECM',
      desc: 'Shaft coupling misalignment with dominant 2x running speed harmonic (49.3 Hz)',
    },
    {
      sheetName: 'Broken_Rotor_Bar_BRB',
      condition: 'BROKEN_ROTOR_BAR',
      rpm: 1470,
      tag: 'PUMP-CW-01',
      bearing: 'SKF 6314-2Z',
      desc: 'Broken rotor bar with pole-pass frequency sidebands modulating 1x shaft speed',
    },
    {
      sheetName: 'Healthy_Baseline_ISO',
      condition: 'HEALTHY',
      rpm: 1475,
      tag: 'PUMP-CW-01',
      bearing: 'SKF 6314-2Z',
      desc: 'Healthy baseline conforming to ISO 10816 Zone A (<1.4 mm/s RMS)',
    },
  ];

  for (const item of conditions) {
    const sampleRate = 5000;
    const duration = 1.0;
    const rawData = vibrationService.generateVibrationBenchmark(item.condition, item.rpm, sampleRate, duration);

    const rows = [];
    // Data rows (Time, Acceleration, Velocity approximation)
    for (let i = 0; i < rawData.length; i++) {
      const t = Number((i / sampleRate).toFixed(5));
      const acc = Number(rawData[i].toFixed(4));
      rows.push({
        Time_s: t,
        Acceleration_g: acc,
        Motor_Tag: item.tag,
        Operating_RPM: item.rpm,
        Bearing_Model: item.bearing,
        Defect_Label: item.condition,
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, item.sheetName);
  }

  const outPath = path.join(__dirname, '..', 'data', 'samples', 'motor_vibration_sample_data.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`[+] Successfully wrote sample Excel workbook to: ${outPath}`);
}

generateExcelWorkbook();

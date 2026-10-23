/**
 * Vibration Sensor Routes.
 * 
 * Endpoints:
 * POST /api/vibration/analyze        - Analyze vibration accelerometer waveform with ISO 10816 evaluation.
 * GET  /api/vibration/presets        - List 4 benchmark vibration condition profiles.
 * GET  /api/vibration/motor-specs/:tag - Get motor vibration & bearing specs from Excel.
 */

const express = require('express');
const router = express.Router();
const vibrationService = require('../services/vibrationService');
const excelService = require('../services/excelService');

// POST /api/vibration/analyze
router.post('/analyze', (req, res) => {
  try {
    const payload = req.body || {};
    const result = vibrationService.analyzeVibration(payload);
    res.json(result);
  } catch (err) {
    console.error('[VibrationRouter] Error analyzing vibration:', err.message);
    res.status(500).json({
      status: 'ERROR',
      message: err.message,
    });
  }
});

// GET /api/vibration/presets
router.get('/presets', (req, res) => {
  res.json({
    status: 'SUCCESS',
    data: [
      {
        id: 'HEALTHY',
        name: 'Healthy Machine Baseline',
        description: 'Vibration velocity < 1.4 mm/s (ISO Zone A Good). Uniform Gaussian baseline, normal bearing race smoothness.',
        iso_zone: 'Zone A (Good)',
        primary_indicator: 'Low overall RMS, Kurtosis ~3.0',
      },
      {
        id: 'BEARING_FAILURE',
        name: 'Bearing Outer/Inner Race Damage',
        description: 'Repetitive shock pulses at Ball Pass Frequency Outer Race (BPFO ~75.7 Hz). Elevated Kurtosis (>4.5) and Crest Factor.',
        iso_zone: 'Zone C/D (Warning/Alert)',
        primary_indicator: 'High-frequency resonance shocks, Kurtosis > 4.5',
      },
      {
        id: 'BROKEN_ROTOR_BAR',
        name: 'Broken Rotor Bar Degradation',
        description: 'Pole-pass frequency sidebands (2*s*fs ~1.67 Hz) modulating running speed (1x) due to fluctuating rotor magnetic pull.',
        iso_zone: 'Zone C (Unsatisfactory)',
        primary_indicator: 'Pole-pass twin sidebands around 1x running speed',
      },
      {
        id: 'MISALIGNMENT',
        name: 'Mechanical Shaft Misalignment',
        description: 'Prominent 2x running speed harmonic (at ~49.2 Hz) dominating the vibration spectrum (2x/1x ratio > 50%).',
        iso_zone: 'Zone C/D (High Radial/Axial Vibration)',
        primary_indicator: 'Dominant 2x RPM harmonic peak',
      },
    ],
  });
});

// GET /api/vibration/motor-specs/:tag
router.get('/motor-specs/:tag', (req, res) => {
  try {
    const specs = excelService.getOperatingSpecsByTag(req.params.tag);
    if (!specs) {
      return res.status(404).json({
        status: 'ERROR',
        message: `Motor specs not found for tag '${req.params.tag}'.`,
      });
    }
    const bearingFreqs = vibrationService.calculateBearingFrequencies(
      specs.operating_speed_rpm || specs.rated_speed_rpm || 1475,
      specs.de_bearing
    );

    res.json({
      status: 'SUCCESS',
      data: {
        ...specs,
        bearing_frequencies: bearingFreqs,
        iso_thresholds: vibrationService.ISO_10816_THRESHOLDS,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// GET /api/vibration/sample-download - Download sample vibration Excel workbook
router.get('/sample-download', (req, res) => {
  const filePath = require('path').join(__dirname, '..', 'data', 'samples', 'motor_vibration_sample_data.xlsx');
  if (!require('fs').existsSync(filePath)) {
    return res.status(404).json({
      status: 'ERROR',
      message: 'Sample vibration Excel file not found on server.',
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="motor_vibration_sample_data.xlsx"');
  res.sendFile(filePath);
});

module.exports = router;

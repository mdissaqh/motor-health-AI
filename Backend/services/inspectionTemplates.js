/**
 * Conservative Maintenance Inspection Templates for Induction Motor MCSA.
 * 
 * Defines standardized, conservative inspection procedures for:
 * 1. Broken Rotor Bars (EPRI NP-7502 standard)
 * 2. Bearing Faults (Acoustic + Lubrication audit)
 * 3. Misalignment (Thermal gradient + Laser alignment)
 * 4. Healthy Baseline (Routine electrical logging)
 * 
 * CRITICAL RULE:
 * Every corrective maintenance template includes a mandatory human verification step
 * before any major teardown, rewinding, or motor replacement decision.
 */

const INSPECTION_TEMPLATES = {
  BROKEN_ROTOR_BAR: {
    fault_type: 'BROKEN_ROTOR_BAR',
    title: 'Rotor Cage & Bar Asymmetry Inspection Procedure',
    description: 'MCSA spectral sidebands indicate potential broken rotor bars or high-resistance end-ring brazing joints.',
    priority_basis: 'Evaluated against EPRI NP-7502 logarithmic sideband attenuation delta dB relative to fundamental carrier.',
    safety_protocol: 'Lockout/Tagout (LOTO) electrical feed. Discharge capacitors and verify zero voltage on stator leads before physical contact.',
    initial_inspection_tasks: [
      {
        step: 1,
        task: 'Operational Load Verification',
        details: 'Verify motor is operating at >= 75% rated load to guarantee rotor slip (s >= 0.015) is sufficient for unambiguous sideband separation.',
        required_tools: ['Clamp-on True-RMS Ammeter', 'Optical Tachometer'],
        status: 'PENDING',
      },
      {
        step: 2,
        task: 'High-Resolution Spectral Sideband Zoom',
        details: 'Record 10-second current stream at fs >= 5 kHz. Verify presence of twin (1 +/- 2s)fs sidebands with delta dB < 45 dB.',
        required_tools: ['Portable MCSA Data Collector / DAQ'],
        status: 'PENDING',
      },
      {
        step: 3,
        task: 'Acoustic / Slip-Beating Check',
        details: 'Listen for characteristic 2*s*fs slip-frequency modulated acoustic hum and examine mechanical torque oscillation.',
        required_tools: ['Mechanic Stethoscope / Sound Level Meter'],
        status: 'PENDING',
      },
    ],
    mandatory_human_verification_gate: {
      gate_name: 'PRE-TEARDOWN CONFIRMATORY TESTING',
      requirement: 'MANDATORY: Before removing motor from service or ordering rotor replacement, execute offline electrical verification.',
      verification_steps: [
        {
          code: 'VERIF-BRB-01',
          name: 'Single-Phase Rotor Rotation Test',
          instruction: 'Apply low AC voltage (10-15% rated) to single stator phase. Rotate motor shaft slowly by hand through 360 degrees while recording current. Current fluctuation > 5-10% confirms broken rotor bars.',
          confirmed: false,
          inspector_notes: '',
        },
        {
          code: 'VERIF-BRB-02',
          name: 'Motor Circuit Analysis (MCA) & Inductance Symmetry',
          instruction: 'Perform phase-to-phase inductance balance test. Rule out stator unbalance and static eccentricity before unseating rotor.',
          confirmed: false,
          inspector_notes: '',
        },
      ],
      sign_off_required: true,
      sign_off_role: 'CHIEF_RELIABILITY_ENGINEER',
    },
  },

  BEARING_FAULT: {
    fault_type: 'BEARING_FAULT',
    title: 'Rolling Element Bearing Degradation Inspection Procedure',
    description: 'Current demodulation / envelope analysis detected harmonic modulation characteristic of rolling element impact.',
    priority_basis: 'Current modulation indicates progressive bearing surface distress; conservative schedule prevents cage collapse.',
    safety_protocol: 'Wear safety glasses and hearing protection. Exercise caution around high-speed shaft couplings.',
    initial_inspection_tasks: [
      {
        step: 1,
        task: 'Bearing Housing Temperature & Lubrication Audit',
        details: 'Measure Drive-End (DE) and Non-Drive-End (NDE) bearing housing skin temperatures. Inspect grease purge port for contamination, hardening, or discolored lubricant.',
        required_tools: ['Infrared Thermometer / Thermal Imager'],
        status: 'PENDING',
      },
      {
        step: 2,
        task: 'High-Frequency Ultrasonic Acoustic Audit',
        details: 'Apply ultrasonic sensor probe directly to bearing housing. Listen for cyclical clicking, crackling, or high decibel background hiss.',
        required_tools: ['Ultrasonic Contact Probe'],
        status: 'PENDING',
      },
      {
        step: 3,
        task: 'Corroborating Accelerometer Vibration Analysis',
        details: 'Take tri-axial high-frequency vibration reading (PeakVue / Shock Pulse) to compute exact bearing defect frequencies (BPFO, BPFI, BSF, FTF).',
        required_tools: ['Tri-axial Piezoelectric Accelerometer'],
        status: 'PENDING',
      },
    ],
    mandatory_human_verification_gate: {
      gate_name: 'PRE-REPLACEMENT BEARING LUBRICATION TRIAL',
      requirement: 'MANDATORY: Before scheduling bearing extraction, perform controlled regreasing to determine if anomaly is lubrication starvation.',
      verification_steps: [
        {
          code: 'VERIF-BRG-01',
          name: 'Controlled Regreasing & Acoustic Trend Monitoring',
          instruction: 'Apply manufacturer-specified quantity of clean grease while monitoring ultrasonic dB. If ultrasonic level drops > 8-10 dB, defect is dry bearing; monitor trend over 48 hours.',
          confirmed: false,
          inspector_notes: '',
        },
        {
          code: 'VERIF-BRG-02',
          name: 'Debris & Ferrography Screening',
          instruction: 'Sample purged grease for metallic flakes and magnetic particles using magnet test.',
          confirmed: false,
          inspector_notes: '',
        },
      ],
      sign_off_required: true,
      sign_off_role: 'VIBRATION_SPECIALIST',
    },
  },

  MISALIGNMENT: {
    fault_type: 'MISALIGNMENT',
    title: 'Coupling & Mechanical Shaft Alignment Inspection Procedure',
    description: 'Elevated 2x line frequency harmonic and Park vector distortion indicate angular/parallel shaft misalignment or soft foot.',
    priority_basis: 'Misalignment increases radial bearing load and accelerates seal/coupling degradation.',
    safety_protocol: 'Lockout/Tagout motor disconnect switch. Install coupling guard before test runs.',
    initial_inspection_tasks: [
      {
        step: 1,
        task: 'Coupling Visual & Tactile Inspection',
        details: 'Inspect elastomer spider insert, grid spring, or disc pack for fretting dust, extrusion, or excessive backlash.',
        required_tools: ['Inspection Flashlight', 'Feeler Gauge'],
        status: 'PENDING',
      },
      {
        step: 2,
        task: 'Thermal Gradient Measurement Across Coupling',
        details: 'Thermal imaging of driving and driven shaft hubs under load. Temperature delta > 5 deg C across coupling indicates active misalignment friction.',
        required_tools: ['Thermal Imaging Camera'],
        status: 'PENDING',
      },
      {
        step: 3,
        task: 'Radial & Axial 1X/2X Vibration Check',
        details: 'Verify strong 2X running speed vibration in axial and radial directions with 180-degree phase shift across coupling halves.',
        required_tools: ['Dual-Channel Vibration Analyzer'],
        status: 'PENDING',
      },
    ],
    mandatory_human_verification_gate: {
      gate_name: 'PRE-REALIGNMENT SOFT FOOT & BASE CHECK',
      requirement: 'MANDATORY: Verify base flatness and soft foot before adjusting motor shims or moving driven equipment.',
      verification_steps: [
        {
          code: 'VERIF-ALIGN-01',
          name: 'Soft Foot Dial Indicator Verification',
          instruction: 'Loosen each hold-down bolt individually while monitoring dial indicator. Deflection > 0.05 mm indicates soft foot requiring shimming.',
          confirmed: false,
          inspector_notes: '',
        },
        {
          code: 'VERIF-ALIGN-02',
          name: 'Dual-Laser Precision Shaft Alignment',
          instruction: 'Conduct precision laser alignment measuring vertical and horizontal angularity and offset in cold and thermal steady-state.',
          confirmed: false,
          inspector_notes: '',
        },
      ],
      sign_off_required: true,
      sign_off_role: 'MECHANICAL_MAINTENANCE_LEAD',
    },
  },

  HEALTHY: {
    fault_type: 'HEALTHY',
    title: 'Routine Baseline Logging & Preventative Check',
    description: 'Motor current signature analysis indicates electromagnetic symmetry and healthy operating parameters.',
    priority_basis: 'Standard preventative maintenance schedule.',
    safety_protocol: 'General industrial plant safety rules apply.',
    initial_inspection_tasks: [
      {
        step: 1,
        task: 'Baseline Electrical Parameter Archival',
        details: 'Log fundamental frequency, RMS current, crest factor, and Park unbalance into plant reliability database.',
        required_tools: ['MCSA Software Gateway'],
        status: 'COMPLETED',
      },
      {
        step: 2,
        task: 'Motor Cooling Fan & Air Cowling Check',
        details: 'Verify motor cooling fan cowl is free of lint, dust buildup, or debris obstructing heat dissipation.',
        required_tools: ['Visual Inspection'],
        status: 'PENDING',
      },
    ],
    mandatory_human_verification_gate: null,
  },
};

/**
 * Returns conservative template tailored to the diagnostic result and severity.
 */
function getInspectionTemplate(predictedClass, severityStatus, deltaDb) {
  const faultKey = predictedClass ? predictedClass.toUpperCase() : 'HEALTHY';
  const baseTemplate = INSPECTION_TEMPLATES[faultKey] || INSPECTION_TEMPLATES.HEALTHY;

  // Determine conservative Priority based on EPRI delta dB or fault severity
  let priority = 'MEDIUM';
  let targetCompletionDays = 30;

  if (faultKey === 'BROKEN_ROTOR_BAR') {
    if (deltaDb !== undefined && deltaDb < 35.0) {
      priority = 'CRITICAL';
      targetCompletionDays = 2; // 48 hours
    } else if (deltaDb !== undefined && deltaDb < 45.0) {
      priority = 'HIGH';
      targetCompletionDays = 7;
    } else {
      priority = 'MEDIUM';
      targetCompletionDays = 30;
    }
  } else if (faultKey === 'BEARING_FAULT') {
    priority = 'HIGH';
    targetCompletionDays = 14;
  } else if (faultKey === 'MISALIGNMENT') {
    priority = 'MEDIUM';
    targetCompletionDays = 21;
  } else {
    priority = 'LOW';
    targetCompletionDays = 90;
  }

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + targetCompletionDays);

  return {
    ...baseTemplate,
    priority,
    target_completion_date: targetDate.toISOString(),
  };
}

module.exports = {
  INSPECTION_TEMPLATES,
  getInspectionTemplate,
};

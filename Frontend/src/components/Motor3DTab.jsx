import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import ErrorBoundary from './ErrorBoundary';

// Fleet Motors seed matching the dataset and user screenshots
const FLEET_MOTORS = [
  {
    tag: 'PUMP-CW-01',
    name: 'Cooling Water Circulation Pump Motor',
    location: 'Pump House Bay 1',
    rated_kw: 75.0,
    voltage_v: 400,
    rated_rpm: 1475,
    poles: 4,
    bearing_de: 'SKF 6314-2Z',
    bearing_nde: 'SKF 6312-2Z',
    application: 'Centrifugal Circulation Pump',
    defaultCondition: 'HEALTHY',
    confidence: 90.0,
    healthScore: 99,
    severity: 'Normal Operating Condition',
  },
  {
    tag: 'FAN-ID-02',
    name: 'Induced Draft Boiler Exhaust Fan Motor',
    location: 'Boiler House Level 3',
    rated_kw: 110.0,
    voltage_v: 400,
    rated_rpm: 1480,
    poles: 4,
    bearing_de: 'SKF NU 318 ECM',
    bearing_nde: 'SKF 6318 C3',
    application: 'Heavy Draft Fan System',
    defaultCondition: 'BEARING_FAULT',
    confidence: 88.4,
    healthScore: 58,
    severity: 'Advisory — Raceway Spalling Detected',
  },
  {
    tag: 'COMP-AIR-01',
    name: 'Instrument Air Screw Compressor Motor',
    location: 'Compressor Utility Room',
    rated_kw: 45.0,
    voltage_v: 400,
    rated_rpm: 2950,
    poles: 2,
    bearing_de: 'SKF 6311-2RS1',
    bearing_nde: 'SKF 6211-2RS1',
    application: 'Rotary Screw Compressor',
    defaultCondition: 'BROKEN_ROTOR_BAR',
    confidence: 92.1,
    healthScore: 42,
    severity: 'Critical — Cage Bar Fracture Modulations',
  },
  {
    tag: 'CONV-FEED-03',
    name: 'Coal Conveyor Overland Drive Motor',
    location: 'Conveyor Transfer Tower B',
    rated_kw: 30.0,
    voltage_v: 400,
    rated_rpm: 1465,
    poles: 4,
    bearing_de: 'SKF 6309-2Z',
    bearing_nde: 'SKF 6209-2Z',
    application: 'Overland Belt Drive',
    defaultCondition: 'MISALIGNMENT',
    confidence: 86.7,
    healthScore: 64,
    severity: 'Elevated — Shaft Angular Misalignment',
  },
];

// Defect definitions matching Picture 1
const DEFECT_MODES = [
  {
    id: 'HEALTHY',
    label: 'Healthy Motor',
    category: 'Nominal Baseline',
    rank: '#1',
    color: '#10B981',
    emissive: 0x059669,
    highlightPart: 'ALL_NOMINAL',
    description: 'Motor current and magnetic field are balanced with no electrical or mechanical defects.',
    componentName: 'All Components Balanced',
    telemetry: {
      vibration_rms: '0.92 mm/s',
      sideband_db: '-58.4 dB',
      bearing_impact_g: '0.12 g',
      temp_c: '48.2 °C',
      iso_zone: 'Zone A (Good)',
    },
    action: 'Continue continuous baseline monitoring; routine lubrication schedule.',
  },
  {
    id: 'MISALIGNMENT',
    label: 'Shaft Misalignment',
    category: 'Coupling / Offset Defect',
    rank: '#2',
    color: '#8B5CF6',
    emissive: 0x7C3AED,
    highlightPart: 'SHAFT_COUPLING',
    description: 'Dynamic angular & parallel offset flex at motor-to-pump flexible coupling hub.',
    componentName: 'Drive Shaft & Flexible Coupling',
    telemetry: {
      vibration_rms: '4.85 mm/s',
      sideband_db: '-41.2 dB',
      bearing_impact_g: '0.65 g',
      temp_c: '62.4 °C',
      iso_zone: 'Zone C (Unrestricted)',
    },
    action: 'Perform laser optical alignment on motor & load coupling before next operating cycle.',
  },
  {
    id: 'BEARING_FAULT',
    label: 'Bearing Raceway Wear',
    category: 'Mechanical Bearing Defect',
    rank: '#3',
    color: '#F43F5E',
    emissive: 0xE11D48,
    highlightPart: 'BEARING_DE',
    description: 'Mechanical fatigue flaking & defect impact pulses on Drive-End (DE) bearing outer raceway.',
    componentName: 'Drive-End (DE) Bearing Assembly',
    telemetry: {
      vibration_rms: '7.12 mm/s',
      sideband_db: '-36.5 dB',
      bearing_impact_g: '2.84 g',
      temp_c: '74.8 °C',
      iso_zone: 'Zone D (Danger)',
    },
    action: 'Schedule grease replenishment or replace Drive-End bearing during planned downtime window.',
  },
  {
    id: 'BROKEN_ROTOR_BAR',
    label: 'Broken Rotor Bar',
    category: 'Rotor Cage Defect',
    rank: '#4',
    color: '#F59E0B',
    emissive: 0xD97706,
    highlightPart: 'ROTOR_BARS',
    description: 'Severe electrical asymmetry in squirrel-cage rotor bars generating fs(1±2s) sideband modulation.',
    componentName: 'Squirrel-Cage Rotor Bar #7 & #8',
    telemetry: {
      vibration_rms: '3.45 mm/s',
      sideband_db: '-28.1 dB',
      bearing_impact_g: '0.38 g',
      temp_c: '83.5 °C',
      iso_zone: 'Zone C (Warning)',
    },
    action: 'Perform offline single-phase rotor rotation test or MCSA current verification; plan rotor refurbishing.',
  },
];

// Comprehensive Engineering Component Specifications & Defect Mapping
const MOTOR_PARTS_METADATA = {
  SHAFT_COUPLING: {
    id: 'SHAFT_COUPLING',
    name: 'Drive Shaft & Flexible Jaw Coupling',
    assembly: 'Drive Train / Coupling Hub',
    cameraPreset: 'drive',
    defectId: 'MISALIGNMENT',
    description: 'Forged chrome-moly steel shaft transmitting mechanical torque via a three-piece flexible jaw coupling with elastomeric spider insert.',
    defectCondition: {
      defectTitle: 'Shaft Dynamic Angular & Parallel Misalignment',
      defectLocation: 'Coupling Hub & DE Shaft Extension',
      defectMechanism: 'Excessive centerline offset flexes the elastomeric spider insert, transmitting 2X rotational cyclic bending stress onto bearings and shaft journals.',
      telemetry: '2X RPM Harmonics: 4.85 mm/s RMS (ISO Zone C)',
      action: 'Perform precision laser optical alignment; adjust motor base shims and torque hold-down bolts.',
    },
    nominalCondition: {
      statusText: 'Nominal Dynamic Balance',
      details: 'Shaft rotating true with total radial runout < 0.02 mm. Flexible coupling spider absorbs normal torque spikes.',
    },
  },
  BEARING_DE: {
    id: 'BEARING_DE',
    name: 'Drive-End (DE) Deep Groove Bearing',
    assembly: 'Drive-End Bearing Journal',
    cameraPreset: 'bearing',
    defectId: 'BEARING_FAULT',
    description: 'Precision rolling element bearing sustaining heavy primary radial and cantilever belt/coupling loads.',
    defectCondition: {
      defectTitle: 'Outer Raceway Fatigue Spalling & Micro-Flaking',
      defectLocation: 'DE Bearing Outer Ring Raceway & Ball Path',
      defectMechanism: 'Repetitive rolling contact stress exceeds fatigue limits, dislodging micro-flakes and generating high-frequency shock pulse impacts at BPFO.',
      telemetry: 'Impact Shock Pulse: 2.84 g peak-to-peak at BPFO (104.2 Hz)',
      action: 'Replenish polyurea grease or replace Drive-End bearing unit during planned turnaround window.',
    },
    nominalCondition: {
      statusText: 'Smooth Hydrodynamic Film',
      details: 'Elastohydrodynamic lubrication film fully separating rolling elements; shock pulse < 0.15 g baseline.',
    },
  },
  BEARING_NDE: {
    id: 'BEARING_NDE',
    name: 'Non-Drive-End (NDE) Guide Bearing',
    assembly: 'Rear Bearing Housing',
    cameraPreset: 'rear',
    defectId: null,
    description: 'Guide bearing locating the rotor axially and supporting rear overhang and cooling fan loads.',
    nominalCondition: {
      statusText: 'Nominal Operation',
      details: 'Bearing running smooth at 42.1 °C. Zero raceway defect frequencies detected.',
    },
  },
  ROTOR_BARS: {
    id: 'ROTOR_BARS',
    name: 'Squirrel-Cage Copper Rotor Bars & End Rings',
    assembly: 'Rotor Electromagnetic Core',
    cameraPreset: 'rotor',
    defectId: 'BROKEN_ROTOR_BAR',
    description: '28 skewed electrolytic copper bars brazed to dual copper shorting end-rings inside high-permeability rotor laminations.',
    defectCondition: {
      defectTitle: 'Broken Rotor Bar Fracture & Flux Asymmetry',
      defectLocation: 'Rotor Bars #7 & #8 near DE Brazed Joint',
      defectMechanism: 'Thermal start-up cycling and electromagnetic radial forces caused bar fatigue cracking, forcing adjacent bars to carry excess current and distorting rotating flux.',
      telemetry: 'MCSA Current Sidebands: fs(1 ± 2s) at -28.1 dB with torque ripple',
      action: 'Conduct offline single-phase rotor rotation test or high-resolution MCSA verification; plan rotor re-barring.',
    },
    nominalCondition: {
      statusText: 'Balanced Current Distribution',
      details: 'Uniform 28-bar cage electrical conductance; symmetrical airgap magnetic flux density.',
    },
  },
  STATOR_HOUSING: {
    id: 'STATOR_HOUSING',
    name: 'Cast-Iron Stator Housing & Cooling Fins',
    assembly: 'Stator Thermal Enclosure',
    cameraPreset: 'iso',
    defectId: null,
    description: 'Rigid grade 250 cast-iron motor frame with 16 longitudinal aerodynamic cooling fins for forced convective cooling.',
    nominalCondition: {
      statusText: 'Structural Integrity Nominal',
      details: 'Thermal dissipation nominal; casing temperature 48.2 °C. Foot mounting rigid with zero soft-foot.',
    },
  },
  STATOR_WINDINGS: {
    id: 'STATOR_WINDINGS',
    name: 'Stator Core & Class F Copper Windings',
    assembly: 'Electromagnetic Stator Assembly',
    cameraPreset: 'iso',
    defectId: null,
    description: 'Vacuum-pressure impregnated Class F insulated copper coils producing balanced 400V 3-phase rotating magnetic field.',
    nominalCondition: {
      statusText: 'Balanced 3-Phase Electromagnetic Field',
      details: 'Phase resistance balance within 0.8%; winding insulation resistance > 100 MΩ.',
    },
  },
  TERMINAL_BOX: {
    id: 'TERMINAL_BOX',
    name: 'Terminal Junction Box & Cable Gland',
    assembly: 'Electrical Power Junction',
    cameraPreset: 'iso',
    defectId: null,
    description: 'IP66 top-mounted dust and water-tight power terminal enclosure with brass cable gland entry.',
    nominalCondition: {
      statusText: 'Secure Electrical Connection',
      details: 'Connection lugs torqued to 18 N·m; zero corona discharge or phase-to-ground leakage.',
    },
  },
  COOLING_FAN: {
    id: 'COOLING_FAN',
    name: 'Rear Radial Cooling Fan & Cowl Shroud',
    assembly: 'Ventilation & Forced Airflow',
    cameraPreset: 'rear',
    defectId: null,
    description: '8-blade bi-directional cooling impeller enclosed by aerodynamic pressed-steel cowl with protective intake grill.',
    nominalCondition: {
      statusText: 'Forced Convective Flow Nominal',
      details: 'Impeller dynamically balanced; providing 4.2 m/s cooling airflow over stator fins.',
    },
  },
};

export default function Motor3DTab({ onNavigateToDiagnose, onNavigateToMaintenance }) {
  const [selectedTag, setSelectedTag] = useState('PUMP-CW-01');
  const [defectMode, setDefectMode] = useState('HEALTHY');
  const [xrayOpacity, setXrayOpacity] = useState(0.45);
  const [explodedView, setExplodedView] = useState(false);
  const [explodeFactor, setExplodeFactor] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);
  const [highlightPulse, setHighlightPulse] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [activeCameraAngle, setActiveCameraAngle] = useState('iso');
  const [hoveredPartInfo, setHoveredPartInfo] = useState(null);
  const [pinnedPartKey, setPinnedPartKey] = useState(null);
  const [showDefectBeacon, setShowDefectBeacon] = useState(true);

  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const motorGroupRef = useRef(null);
  const rotorGroupRef = useRef(null);
  const shaftMeshRef = useRef(null);
  const couplingMeshRef = useRef(null);
  const housingMeshRef = useRef(null);
  const deBearingGroupRef = useRef(null);
  const ndeBearingGroupRef = useRef(null);
  const brokenBarMeshRef = useRef(null);
  const fanGroupRef = useRef(null);
  const pulseMeshGroupRef = useRef([]);
  const explodedPartsRef = useRef({});
  const defectBeaconRef = useRef(null);
  const interactiveObjectsRef = useRef([]);

  const audioCtxRef = useRef(null);
  const audioOscRef = useRef(null);
  const audioGainRef = useRef(null);

  const activeMotor = useMemo(() => {
    return FLEET_MOTORS.find((m) => m.tag === selectedTag) || FLEET_MOTORS[0];
  }, [selectedTag]);

  const activeDefect = useMemo(() => {
    return DEFECT_MODES.find((d) => d.id === defectMode) || DEFECT_MODES[0];
  }, [defectMode]);

  // When motor changes, automatically initialize to its default condition or maintain state
  const handleSelectMotor = (tag) => {
    setSelectedTag(tag);
    const m = FLEET_MOTORS.find((mot) => mot.tag === tag);
    if (m && m.defaultCondition) {
      setDefectMode(m.defaultCondition);
    }
  };

  // Sound Synthesizer for Motor Physical Audio
  useEffect(() => {
    if (!audioEnabled) {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const gain = ctx.createGain();

      const baseFreq = (activeMotor.rated_rpm / 60) * (activeMotor.poles / 2);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(50.0, ctx.currentTime);

      // Low volume for comfortable demonstration
      gain.gain.setValueAtTime(0.04, ctx.currentTime);

      osc.connect(gain);
      subOsc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      subOsc.start();
      audioOscRef.current = osc;
      audioGainRef.current = gain;
    } catch (e) {
      console.warn('Audio synth init notice:', e);
    }

    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [audioEnabled, activeMotor]);

  // Three.js Scene Setup & Model Construction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 520;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xF7FAFE); // Light industrial theme background

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(7.5, 4.2, 7.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // 2. Lighting System
    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 1.2);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x087ACB, 1.6);
    dirLight1.position.set(10, 15, 10);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xE0F2FE, 1.1);
    dirLight2.position.set(-10, 8, -8);
    scene.add(dirLight2);

    const rimLight = new THREE.DirectionalLight(0x38BDF8, 0.8);
    rimLight.position.set(0, -6, 8);
    scene.add(rimLight);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(16, 24, 0x087ACB, 0xDCE7F2);
    gridHelper.position.y = -1.6;
    scene.add(gridHelper);

    // Subtle Ground Shadow Plane
    const groundGeo = new THREE.PlaneGeometry(16, 16);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.12 });
    const groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -1.6;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // 3. Assemble Comprehensive AC Induction Motor Model
    const motorRoot = new THREE.Group();
    motorGroupRef.current = motorRoot;
    scene.add(motorRoot);

    const explodedMap = {};

    // Helper to tag meshes with component keys and register them for raycasting
    const interactiveObjects = [];
    const tagPart = (obj, partKey) => {
      if (!obj) return;
      obj.userData = obj.userData || {};
      obj.userData.partKey = partKey;
      obj.userData.isInteractive = true;
      if (obj.isMesh) {
        interactiveObjects.push(obj);
      }
      if (obj.children && obj.children.length > 0) {
        obj.children.forEach((c) => tagPart(c, partKey));
      }
    };

    // ------------------------------------------------------------
    // A. Stator Frame (Cast Iron Housing with Cooling Fins)
    // ------------------------------------------------------------
    const housingGroup = new THREE.Group();
    const frameLength = 3.6;
    const frameRadius = 1.35;

    // Stator Body Cylinder
    const housingGeo = new THREE.CylinderGeometry(frameRadius, frameRadius, frameLength, 32, 1, true);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x1E3A5F, // Deep industrial navy
      roughness: 0.45,
      metalness: 0.35,
      transparent: true,
      opacity: xrayOpacity,
      side: THREE.DoubleSide,
    });
    const housingMesh = new THREE.Mesh(housingGeo, housingMat);
    housingMesh.rotation.z = Math.PI / 2;
    housingMesh.castShadow = true;
    housingMeshRef.current = housingMesh;
    housingGroup.add(housingMesh);
    tagPart(housingMesh, 'STATOR_HOUSING');

    // Stator Cooling Ribs / Fins (16 axial fins)
    const finCount = 16;
    const finMat = new THREE.MeshStandardMaterial({
      color: 0x27496D,
      roughness: 0.5,
      metalness: 0.3,
      transparent: true,
      opacity: xrayOpacity,
    });
    for (let i = 0; i < finCount; i++) {
      const angle = (i / finCount) * Math.PI * 2;
      const finGeo = new THREE.BoxGeometry(0.06, 0.22, frameLength * 0.95);
      const finMesh = new THREE.Mesh(finGeo, finMat);
      finMesh.position.x = 0;
      finMesh.position.y = Math.cos(angle) * (frameRadius + 0.08);
      finMesh.position.z = Math.sin(angle) * (frameRadius + 0.08);
      finMesh.rotation.x = -angle;
      housingGroup.add(finMesh);
      tagPart(finMesh, 'STATOR_HOUSING');
    }

    // Terminal Box (Top Mounted)
    const tBoxGeo = new THREE.BoxGeometry(0.8, 0.55, 0.7);
    const tBoxMat = new THREE.MeshStandardMaterial({ color: 0x0F253E, roughness: 0.4, metalness: 0.5 });
    const tBoxMesh = new THREE.Mesh(tBoxGeo, tBoxMat);
    tBoxMesh.position.set(0, frameRadius + 0.35, 0);
    tBoxMesh.castShadow = true;
    housingGroup.add(tBoxMesh);
    tagPart(tBoxMesh, 'TERMINAL_BOX');

    // Terminal Gland & Eyebolt
    const glandGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 12);
    const glandMat = new THREE.MeshStandardMaterial({ color: 0xEAB308, metalness: 0.8 });
    const gland = new THREE.Mesh(glandGeo, glandMat);
    gland.position.set(0.45, frameRadius + 0.35, 0);
    gland.rotation.z = Math.PI / 2;
    housingGroup.add(gland);
    tagPart(gland, 'TERMINAL_BOX');

    // Mounting Base Feet (4 bolt pads)
    const footMat = new THREE.MeshStandardMaterial({ color: 0x1E3A5F, metalness: 0.4, roughness: 0.6 });
    const foot1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.5), footMat);
    foot1.position.set(-1.1, -frameRadius - 0.1, 1.05);
    const foot2 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.5), footMat);
    foot2.position.set(1.1, -frameRadius - 0.1, 1.05);
    const foot3 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.5), footMat);
    foot3.position.set(-1.1, -frameRadius - 0.1, -1.05);
    const foot4 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.5), footMat);
    foot4.position.set(1.1, -frameRadius - 0.1, -1.05);
    housingGroup.add(foot1, foot2, foot3, foot4);
    tagPart(foot1, 'STATOR_HOUSING');
    tagPart(foot2, 'STATOR_HOUSING');
    tagPart(foot3, 'STATOR_HOUSING');
    tagPart(foot4, 'STATOR_HOUSING');

    motorRoot.add(housingGroup);
    explodedMap.housing = { group: housingGroup, dir: new THREE.Vector3(0, 0, 0) };

    // ------------------------------------------------------------
    // B. Internal Stator Core & Copper Windings (Stationary)
    // ------------------------------------------------------------
    const statorCoreGroup = new THREE.Group();
    const coreGeo = new THREE.CylinderGeometry(1.22, 1.22, 2.2, 32, 1, true);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.35 });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.rotation.z = Math.PI / 2;
    statorCoreGroup.add(coreMesh);
    tagPart(coreMesh, 'STATOR_WINDINGS');

    // Copper Coil Overhangs at both ends
    const windingMat = new THREE.MeshStandardMaterial({ color: 0xB45309, metalness: 0.85, roughness: 0.3 }); // Copper
    const deWinding = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.16, 16, 32), windingMat);
    deWinding.rotation.y = Math.PI / 2;
    deWinding.position.x = 1.25;
    const ndeWinding = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.16, 16, 32), windingMat);
    ndeWinding.rotation.y = Math.PI / 2;
    ndeWinding.position.x = -1.25;
    statorCoreGroup.add(deWinding, ndeWinding);
    tagPart(deWinding, 'STATOR_WINDINGS');
    tagPart(ndeWinding, 'STATOR_WINDINGS');

    motorRoot.add(statorCoreGroup);
    explodedMap.stator = { group: statorCoreGroup, dir: new THREE.Vector3(0, 0, 0) };

    // ------------------------------------------------------------
    // C. Rotating Assembly: Shaft & Squirrel-Cage Rotor
    // ------------------------------------------------------------
    const rotorGroup = new THREE.Group();
    rotorGroupRef.current = rotorGroup;

    // Steel Motor Shaft
    const shaftRadius = 0.32;
    const shaftLength = 6.4;
    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 32);
    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0xCBD5E1,
      metalness: 0.9,
      roughness: 0.15,
    });
    const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
    shaftMesh.rotation.z = Math.PI / 2;
    shaftMesh.position.x = 0.3; // Protrudes more at Drive End (+x)
    shaftMesh.castShadow = true;
    shaftMeshRef.current = shaftMesh;
    rotorGroup.add(shaftMesh);
    tagPart(shaftMesh, 'SHAFT_COUPLING');

    // Flexible Shaft Coupling & Hub (at Drive End)
    const couplingGroup = new THREE.Group();
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
    const couplingHub1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 24), hubMat);
    couplingHub1.rotation.z = Math.PI / 2;
    couplingHub1.position.x = 3.0;

    const flexInsertMat = new THREE.MeshStandardMaterial({ color: 0x8B5CF6, metalness: 0.4, roughness: 0.5 });
    const flexInsert = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.15, 24), flexInsertMat);
    flexInsert.rotation.z = Math.PI / 2;
    flexInsert.position.x = 3.32;

    const couplingHub2 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 24), hubMat);
    couplingHub2.rotation.z = Math.PI / 2;
    couplingHub2.position.x = 3.65;

    couplingGroup.add(couplingHub1, flexInsert, couplingHub2);
    couplingMeshRef.current = couplingGroup;
    rotorGroup.add(couplingGroup);
    tagPart(couplingHub1, 'SHAFT_COUPLING');
    tagPart(flexInsert, 'SHAFT_COUPLING');
    tagPart(couplingHub2, 'SHAFT_COUPLING');
    tagPart(couplingGroup, 'SHAFT_COUPLING');

    // Squirrel-Cage Rotor Core
    const rotorCoreGeo = new THREE.CylinderGeometry(0.85, 0.85, 2.0, 32);
    const rotorCoreMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.65, roughness: 0.4 });
    const rotorCoreMesh = new THREE.Mesh(rotorCoreGeo, rotorCoreMat);
    rotorCoreMesh.rotation.z = Math.PI / 2;
    rotorGroup.add(rotorCoreMesh);
    tagPart(rotorCoreMesh, 'ROTOR_BARS');

    // Copper End Rings (Conducting rings closing the cage)
    const ringGeo = new THREE.TorusGeometry(0.82, 0.08, 16, 32);
    const endRingMat = new THREE.MeshStandardMaterial({ color: 0xD97706, metalness: 0.85, roughness: 0.25 });
    const ringDE = new THREE.Mesh(ringGeo, endRingMat);
    ringDE.rotation.y = Math.PI / 2;
    ringDE.position.x = 1.0;
    const ringNDE = new THREE.Mesh(ringGeo, endRingMat);
    ringNDE.rotation.y = Math.PI / 2;
    ringNDE.position.x = -1.0;
    rotorGroup.add(ringDE, ringNDE);
    tagPart(ringDE, 'ROTOR_BARS');
    tagPart(ringNDE, 'ROTOR_BARS');

    // Individual Squirrel Cage Bars (28 copper bars embedded in slots)
    const numBars = 28;
    const barRadius = 0.82;
    const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.04, 8);
    const normalBarMat = new THREE.MeshStandardMaterial({ color: 0xD97706, metalness: 0.8, roughness: 0.3 });

    // Distinct Broken Bar Material for Defect Mode
    const brokenBarMat = new THREE.MeshStandardMaterial({
      color: 0xEF4444,
      emissive: 0xDC2626,
      emissiveIntensity: 0.8,
      metalness: 0.9,
      roughness: 0.2,
    });

    for (let b = 0; b < numBars; b++) {
      const angle = (b / numBars) * Math.PI * 2;
      const isDefectBar = (b === 7 || b === 8); // Targeted defect bars
      const barMesh = new THREE.Mesh(barGeo, isDefectBar ? brokenBarMat : normalBarMat);
      
      barMesh.position.x = 0;
      barMesh.position.y = Math.cos(angle) * barRadius;
      barMesh.position.z = Math.sin(angle) * barRadius;
      barMesh.rotation.z = Math.PI / 2;
      // Slight skew angle typical of induction motor bars to reduce torque cogging
      barMesh.rotation.y = Math.sin(angle) * 0.04;

      if (isDefectBar && !brokenBarMeshRef.current) {
        brokenBarMeshRef.current = barMesh;
      }
      rotorGroup.add(barMesh);
      tagPart(barMesh, 'ROTOR_BARS');
    }

    // Cooling Fan at Non-Drive End (Mounted on rotor shaft)
    const fanGroup = new THREE.Group();
    fanGroup.position.x = -2.3;
    const fanHub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16), hubMat);
    fanHub.rotation.z = Math.PI / 2;
    fanGroup.add(fanHub);
    tagPart(fanHub, 'COOLING_FAN');

    const fanBladeCount = 8;
    const fanBladeGeo = new THREE.BoxGeometry(0.05, 0.55, 0.2);
    const fanBladeMat = new THREE.MeshStandardMaterial({ color: 0x0284C7, roughness: 0.4, metalness: 0.2 });
    for (let f = 0; f < fanBladeCount; f++) {
      const bladeAngle = (f / fanBladeCount) * Math.PI * 2;
      const blade = new THREE.Mesh(fanBladeGeo, fanBladeMat);
      blade.position.y = Math.cos(bladeAngle) * 0.58;
      blade.position.z = Math.sin(bladeAngle) * 0.58;
      blade.rotation.x = -bladeAngle + 0.35; // Pitch angle
      fanGroup.add(blade);
      tagPart(blade, 'COOLING_FAN');
    }
    fanGroupRef.current = fanGroup;
    rotorGroup.add(fanGroup);

    motorRoot.add(rotorGroup);
    explodedMap.rotor = { group: rotorGroup, dir: new THREE.Vector3(0, 0, 0) };

    // ------------------------------------------------------------
    // D. End Shields & Bearings (Drive End & Non-Drive End)
    // ------------------------------------------------------------
    // DE End Shield
    const deShieldGroup = new THREE.Group();
    deShieldGroup.position.x = 1.8;
    const shieldGeo = new THREE.CylinderGeometry(frameRadius, frameRadius, 0.35, 32);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x1E3A5F,
      roughness: 0.5,
      metalness: 0.35,
      transparent: true,
      opacity: xrayOpacity,
    });
    const deShield = new THREE.Mesh(shieldGeo, shieldMat);
    deShield.rotation.z = Math.PI / 2;
    deShieldGroup.add(deShield);
    tagPart(deShield, 'STATOR_HOUSING');

    // DE Bearing Assembly (Outer ring, Inner ring, Rolling elements)
    const deBearingGroup = new THREE.Group();
    const bearingOuterMat = new THREE.MeshStandardMaterial({
      color: 0xE2E8F0,
      metalness: 0.95,
      roughness: 0.15,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    const deBearingOuter = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.12, 16, 24), bearingOuterMat);
    deBearingOuter.rotation.y = Math.PI / 2;
    deBearingGroup.add(deBearingOuter);
    tagPart(deBearingOuter, 'BEARING_DE');

    // Ball/Roller elements
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xF1F5F9, metalness: 0.98, roughness: 0.1 });
    for (let b = 0; b < 10; b++) {
      const bAngle = (b / 10) * Math.PI * 2;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), ballMat);
      ball.position.y = Math.cos(bAngle) * 0.44;
      ball.position.z = Math.sin(bAngle) * 0.44;
      deBearingGroup.add(ball);
      tagPart(ball, 'BEARING_DE');
    }
    deBearingGroup.position.x = 0;
    deShieldGroup.add(deBearingGroup);
    deBearingGroupRef.current = deBearingOuter;

    motorRoot.add(deShieldGroup);
    explodedMap.deShield = { group: deShieldGroup, dir: new THREE.Vector3(1.8, 0, 0) };

    // NDE End Shield
    const ndeShieldGroup = new THREE.Group();
    ndeShieldGroup.position.x = -1.8;
    const ndeShield = new THREE.Mesh(shieldGeo, shieldMat);
    ndeShield.rotation.z = Math.PI / 2;
    ndeShieldGroup.add(ndeShield);
    tagPart(ndeShield, 'STATOR_HOUSING');

    // NDE Bearing Assembly
    const ndeBearingGroup = new THREE.Group();
    const ndeBearingOuter = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.11, 16, 24), bearingOuterMat);
    ndeBearingOuter.rotation.y = Math.PI / 2;
    ndeBearingGroup.add(ndeBearingOuter);
    ndeShieldGroup.add(ndeBearingGroup);
    ndeBearingGroupRef.current = ndeBearingOuter;
    tagPart(ndeBearingOuter, 'BEARING_NDE');

    motorRoot.add(ndeShieldGroup);
    explodedMap.ndeShield = { group: ndeShieldGroup, dir: new THREE.Vector3(-1.8, 0, 0) };

    // ------------------------------------------------------------
    // E. Fan Cowl / Protective Shroud (Rear End)
    // ------------------------------------------------------------
    const cowlGroup = new THREE.Group();
    cowlGroup.position.x = -2.6;
    const cowlGeo = new THREE.CylinderGeometry(frameRadius * 0.98, frameRadius * 0.98, 1.1, 32, 1, true);
    const cowlMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.5,
      roughness: 0.5,
      transparent: true,
      opacity: xrayOpacity,
      side: THREE.DoubleSide,
    });
    const cowl = new THREE.Mesh(cowlGeo, cowlMat);
    cowl.rotation.z = Math.PI / 2;
    cowlGroup.add(cowl);
    tagPart(cowl, 'COOLING_FAN');

    // Rear Grill mesh
    const grillMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, wireframe: true });
    const grill = new THREE.Mesh(new THREE.CircleGeometry(frameRadius * 0.96, 24), grillMat);
    grill.rotation.y = -Math.PI / 2;
    grill.position.x = -0.55;
    cowlGroup.add(grill);
    tagPart(grill, 'COOLING_FAN');

    motorRoot.add(cowlGroup);
    explodedMap.cowl = { group: cowlGroup, dir: new THREE.Vector3(-3.2, 0, 0) };

    explodedPartsRef.current = explodedMap;
    interactiveObjectsRef.current = interactiveObjects;

    // ------------------------------------------------------------
    // 3D Spatial Defect Locator Beacon / Pin
    // ------------------------------------------------------------
    const defectBeaconGroup = new THREE.Group();
    const beaconColorHex = activeDefect.color ? new THREE.Color(activeDefect.color).getHex() : 0xF43F5E;

    // Glowing Inverted Cone Pointer
    const coneGeo = new THREE.ConeGeometry(0.18, 0.42, 16);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: beaconColorHex,
      emissive: beaconColorHex,
      emissiveIntensity: 1.6,
      metalness: 0.8,
      roughness: 0.2,
    });
    const beaconCone = new THREE.Mesh(coneGeo, beaconMat);
    beaconCone.rotation.x = Math.PI; // Point directly downward toward the defect
    beaconCone.position.y = 0.22;
    defectBeaconGroup.add(beaconCone);

    // Pulsing Concentric Outer Ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: beaconColorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const beaconRing = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.38, 32), ringMat);
    beaconRing.rotation.x = -Math.PI / 2;
    beaconRing.position.y = 0.45;
    defectBeaconGroup.add(beaconRing);

    // Set spatial coordinates corresponding to each defect
    const beaconBaseY = 1.85;
    if (defectMode === 'BEARING_FAULT') {
      defectBeaconGroup.position.set(1.8, beaconBaseY, 0);
      defectBeaconGroup.visible = true;
    } else if (defectMode === 'BROKEN_ROTOR_BAR') {
      defectBeaconGroup.position.set(0, beaconBaseY, 0.84);
      defectBeaconGroup.visible = true;
    } else if (defectMode === 'MISALIGNMENT') {
      defectBeaconGroup.position.set(3.32, beaconBaseY, 0);
      defectBeaconGroup.visible = true;
    } else {
      defectBeaconGroup.position.set(0, beaconBaseY, 0);
      defectBeaconGroup.visible = false;
    }

    tagPart(defectBeaconGroup, activeDefect.highlightPart === 'ALL_NOMINAL' ? 'STATOR_HOUSING' : activeDefect.highlightPart);
    motorRoot.add(defectBeaconGroup);
    defectBeaconRef.current = defectBeaconGroup;

    // ------------------------------------------------------------
    // 4. Interactive Orbital Drag, Raycast Hover & Wheel Controls
    // ------------------------------------------------------------
    let isDragging = false;
    let hasDragged = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let spherical = {
      radius: 11.5,
      theta: Math.PI / 4,
      phi: Math.PI / 3,
    };

    const updateCameraPos = () => {
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
      spherical.radius = Math.max(3.5, Math.min(22, spherical.radius));

      camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = spherical.radius * Math.cos(spherical.phi);
      camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(0, 0, 0);
    };
    updateCameraPos();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let currentHoveredPartKey = null;
    let highlightedMeshes = [];

    const clearHighlight = () => {
      if (highlightedMeshes.length > 0) {
        highlightedMeshes.forEach((mesh) => {
          if (mesh && mesh.material) {
            if (mesh.userData._origEmissive) {
              mesh.material.emissive.copy(mesh.userData._origEmissive);
            }
            if (typeof mesh.userData._origIntensity === 'number') {
              mesh.material.emissiveIntensity = mesh.userData._origIntensity;
            }
          }
        });
        highlightedMeshes = [];
      }
      currentHoveredPartKey = null;
      setHoveredPartInfo(null);
      if (canvas) canvas.style.cursor = 'grab';
    };

    const handlePointerHover = (clientX, clientY) => {
      if (isDragging || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(interactiveObjects, true);

      if (!intersects || intersects.length === 0) {
        if (currentHoveredPartKey) {
          clearHighlight();
        }
        return;
      }

      // Smart Penetration: When xrayOpacity < 0.88, prioritize internal components
      // so user hovering over rotor bars, bearings, or shaft doesn't get blocked by the outer housing
      let hitPartKey = null;

      const nonHousingIntersects = intersects.filter(
        (it) => it.object.userData?.partKey && it.object.userData.partKey !== 'STATOR_HOUSING'
      );

      if (nonHousingIntersects.length > 0 && xrayOpacity < 0.88) {
        hitPartKey = nonHousingIntersects[0].object.userData.partKey;
      } else {
        const validIntersects = intersects.filter((it) => it.object.userData?.partKey);
        if (validIntersects.length > 0) {
          hitPartKey = validIntersects[0].object.userData.partKey;
        }
      }

      if (!hitPartKey || !MOTOR_PARTS_METADATA[hitPartKey]) {
        if (currentHoveredPartKey) {
          clearHighlight();
        }
        return;
      }

      // Hover changed to new part
      if (hitPartKey !== currentHoveredPartKey) {
        // Revert previous highlighted meshes
        highlightedMeshes.forEach((mesh) => {
          if (mesh && mesh.material) {
            if (mesh.userData._origEmissive) {
              mesh.material.emissive.copy(mesh.userData._origEmissive);
            }
            if (typeof mesh.userData._origIntensity === 'number') {
              mesh.material.emissiveIntensity = mesh.userData._origIntensity;
            }
          }
        });
        highlightedMeshes = [];

        // Apply new highlight
        currentHoveredPartKey = hitPartKey;
        const meta = MOTOR_PARTS_METADATA[hitPartKey];
        const isDefectivePart = meta.defectId === defectMode;

        const targetMeshes = interactiveObjects.filter((m) => m.userData.partKey === hitPartKey);
        targetMeshes.forEach((mesh) => {
          if (mesh && mesh.material) {
            if (!mesh.userData._origEmissive) {
              mesh.userData._origEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : new THREE.Color(0x000000);
              mesh.userData._origIntensity = typeof mesh.material.emissiveIntensity === 'number' ? mesh.material.emissiveIntensity : 0;
            }

            if (isDefectivePart) {
              // High-visibility glowing alert emissive
              const defectEmissive = activeDefect.emissive || 0xEF4444;
              mesh.material.emissive.setHex(defectEmissive);
              mesh.material.emissiveIntensity = 2.4;
            } else {
              // High-tech azure blue highlight
              mesh.material.emissive.setHex(0x0284C7);
              mesh.material.emissiveIntensity = 1.35;
            }
            highlightedMeshes.push(mesh);
          }
        });

        canvas.style.cursor = 'pointer';
      }

      // Always update screen coordinates for fluid tooltip following
      const meta = MOTOR_PARTS_METADATA[hitPartKey];
      const isDefectivePart = meta.defectId === defectMode;
      setHoveredPartInfo({
        partKey: hitPartKey,
        name: meta.name,
        assembly: meta.assembly,
        description: meta.description,
        isDefective: isDefectivePart,
        defectCondition: isDefectivePart ? meta.defectCondition : null,
        nominalCondition: meta.nominalCondition,
        activeDefectPartName: activeDefect.componentName,
        activeDefectLabel: activeDefect.label,
        activeDefectId: defectMode,
        activeDefectColor: activeDefect.color,
        screenX: clientX - rect.left,
        screenY: clientY - rect.top,
      });
    };

    const onMouseDown = (e) => {
      isDragging = true;
      hasDragged = false;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
      canvas.style.cursor = 'grabbing';
    };

    const onMouseMove = (e) => {
      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
          hasDragged = true;
        }
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;

        spherical.theta -= deltaX * 0.007;
        spherical.phi -= deltaY * 0.007;
        updateCameraPos();
        return;
      }

      handlePointerHover(e.clientX, e.clientY);
    };

    const onMouseUp = () => {
      isDragging = false;
      canvas.style.cursor = currentHoveredPartKey ? 'pointer' : 'grab';

      // If clicked without dragging, pin part and focus camera
      if (!hasDragged && currentHoveredPartKey) {
        const meta = MOTOR_PARTS_METADATA[currentHoveredPartKey];
        if (meta && meta.cameraPreset) {
          handleCameraPreset(meta.cameraPreset);
        }
        setPinnedPartKey(currentHoveredPartKey);
      }
    };

    const onMouseLeave = () => {
      isDragging = false;
      clearHighlight();
    };

    const onWheel = (e) => {
      e.preventDefault();
      spherical.radius += e.deltaY * 0.01;
      updateCameraPos();
    };

    // Touch support for tablets / touch screens
    let touchStartX = 0;
    let touchStartY = 0;
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isDragging = true;
      }
    };
    const onTouchMove = (e) => {
      if (isDragging && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - touchStartX;
        const deltaY = e.touches[0].clientY - touchStartY;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;

        spherical.theta -= deltaX * 0.008;
        spherical.phi -= deltaY * 0.008;
        updateCameraPos();
      }
    };
    const onTouchEnd = () => {
      isDragging = false;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });

    // Handle Window Resize
    const handleResize = () => {
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // ------------------------------------------------------------
    // 5. Continuous Render & Physics Animation Loop
    // ------------------------------------------------------------
    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      // Continuous rotation of the rotor & shaft
      if (rotorGroupRef.current && isPlaying) {
        const rotSpeed = ((activeMotor.rated_rpm / 60) * 0.25 * speedMultiplier);
        rotorGroupRef.current.rotation.x += rotSpeed * delta * 2 * Math.PI;

        // In Shaft Misalignment mode, simulate minute angular wobble at the coupling hub
        if (defectMode === 'MISALIGNMENT' && couplingMeshRef.current) {
          couplingMeshRef.current.rotation.y = Math.sin(elapsedTime * 12) * 0.08;
          couplingMeshRef.current.position.y = Math.cos(elapsedTime * 12) * 0.04;
        } else if (couplingMeshRef.current) {
          couplingMeshRef.current.rotation.y = 0;
          couplingMeshRef.current.position.y = 0;
        }
      }

      // Smooth Exploded View Interpolation
      const targetExplode = explodedView ? 1.0 : 0.0;
      setExplodeFactor((prev) => {
        const next = THREE.MathUtils.lerp(prev, targetExplode, 0.08);
        return next;
      });

      // Update positions of parts based on exploded view
      if (explodedPartsRef.current) {
        Object.values(explodedPartsRef.current).forEach((item) => {
          if (item.dir.lengthSq() > 0) {
            item.group.position.x = item.dir.x * (explodedView ? 1.4 : 0);
          }
        });
      }

      // Animate 3D Spatial Defect Locator Beacon
      if (defectBeaconRef.current && defectBeaconRef.current.visible) {
        const bob = Math.sin(elapsedTime * 4) * 0.08;
        defectBeaconRef.current.position.y = 1.85 + bob;
        const ringScale = 1.0 + Math.sin(elapsedTime * 6) * 0.12;
        if (defectBeaconRef.current.children[1]) {
          defectBeaconRef.current.children[1].scale.set(ringScale, ringScale, ringScale);
        }
      }

      // Dynamic Defect Pulsing Glow
      if (highlightPulse) {
        const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 6);

        if (defectMode === 'BEARING_FAULT' && deBearingGroupRef.current && currentHoveredPartKey !== 'BEARING_DE') {
          deBearingGroupRef.current.material.emissive.setHex(0xE11D48); // Rose red
          deBearingGroupRef.current.material.emissiveIntensity = 0.4 + pulse * 1.2;
        } else if (deBearingGroupRef.current && currentHoveredPartKey !== 'BEARING_DE') {
          deBearingGroupRef.current.material.emissive.setHex(0x000000);
          deBearingGroupRef.current.material.emissiveIntensity = 0;
        }

        if (defectMode === 'BROKEN_ROTOR_BAR' && brokenBarMeshRef.current && currentHoveredPartKey !== 'ROTOR_BARS') {
          brokenBarMeshRef.current.material.emissiveIntensity = 0.5 + pulse * 1.5;
        }

        if (defectMode === 'MISALIGNMENT' && couplingMeshRef.current && currentHoveredPartKey !== 'SHAFT_COUPLING') {
          flexInsertMat.emissive = new THREE.Color(0x7C3AED);
          flexInsertMat.emissiveIntensity = 0.4 + pulse * 1.0;
        } else if (currentHoveredPartKey !== 'SHAFT_COUPLING') {
          flexInsertMat.emissive = new THREE.Color(0x000000);
          flexInsertMat.emissiveIntensity = 0;
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      renderer.dispose();
    };
  }, [activeMotor, defectMode, isPlaying, speedMultiplier, explodedView, highlightPulse]);

  // Update Opacity when slider changes
  useEffect(() => {
    if (housingMeshRef.current) {
      housingMeshRef.current.material.opacity = xrayOpacity;
    }
  }, [xrayOpacity]);

  // Quick Action to Focus Camera Directly on Active Defect
  const handleFocusActiveDefect = () => {
    if (defectMode === 'BEARING_FAULT') {
      handleCameraPreset('bearing');
    } else if (defectMode === 'BROKEN_ROTOR_BAR') {
      handleCameraPreset('rotor');
    } else if (defectMode === 'MISALIGNMENT') {
      handleCameraPreset('drive');
    } else {
      handleCameraPreset('iso');
    }
  };

  // Handle Preset Camera Angles
  const handleCameraPreset = (preset) => {
    setActiveCameraAngle(preset);
    if (!cameraRef.current) return;
    const cam = cameraRef.current;

    switch (preset) {
      case 'iso':
        cam.position.set(7.5, 4.2, 7.5);
        cam.lookAt(0, 0, 0);
        break;
      case 'drive':
        cam.position.set(6.8, 1.2, 2.2);
        cam.lookAt(2.5, 0, 0);
        break;
      case 'rotor':
        cam.position.set(0.2, 2.5, 5.0);
        cam.lookAt(0, 0, 0);
        break;
      case 'bearing':
        cam.position.set(4.2, 2.0, 3.5);
        cam.lookAt(1.8, 0, 0);
        break;
      case 'rear':
        cam.position.set(-6.5, 2.5, 3.5);
        cam.lookAt(-1.5, 0, 0);
        break;
      default:
        break;
    }
  };

  return (
    <ErrorBoundary title="3D Induction Motor Digital Twin">
      <div>
        {/* Top Control Toolbar & Fleet Asset Selector */}
        <div className="card" style={{ marginBottom: '1.25rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                <span className="badge badge-cyan">3D WebGL Digital Twin</span>
                <span className="badge badge-purple">Three.js Physical Engine</span>
                <span className="badge badge-emerald">60 FPS Animation</span>
              </div>
              <h1 style={{ fontSize: '1.35rem', color: 'var(--navy-primary)', fontWeight: 700, margin: '0.2rem 0' }}>
                3D AC Induction Motor & Mechanical Defect Localization
              </h1>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Interactive spatial visualization of stator laminations, rotor cage bars, bearing raceways, and shaft coupling under real-time condition monitoring.
              </p>
            </div>

            {/* Fleet Motor Asset Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Select Fleet Motor:
                </label>
                <select
                  value={selectedTag}
                  onChange={(e) => handleSelectMotor(e.target.value)}
                  className="form-select"
                  style={{ minWidth: '310px', fontSize: '0.85rem', fontWeight: 600, padding: '0.45rem 0.75rem' }}
                >
                  {FLEET_MOTORS.map((m) => (
                    <option key={m.tag} value={m.tag}>
                      {m.tag} — {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {onNavigateToDiagnose && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onNavigateToDiagnose}
                  style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}
                >
                  Upload Current Data →
                </button>
              )}
            </div>
          </div>

          {/* Defect Mode Selection Pills (Matching Picture 1) */}
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-primary)', textTransform: 'uppercase' }}>
                Simulate Condition / Defect Mode:
              </span>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {DEFECT_MODES.map((dm) => {
                  const isSelected = defectMode === dm.id;
                  return (
                    <button
                      key={dm.id}
                      type="button"
                      onClick={() => setDefectMode(dm.id)}
                      style={{
                        background: isSelected ? dm.color : 'var(--bg-surface-elevated)',
                        color: isSelected ? '#FFFFFF' : 'var(--text-main)',
                        border: isSelected ? `1px solid ${dm.color}` : '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '0.4rem 0.85rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? `0 2px 8px ${dm.color}40` : 'none',
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isSelected ? '#fff' : dm.color }} />
                      <span>{dm.label}</span>
                      <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>({dm.category.split('/')[0].trim()})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Main 3D Interactive Stage & Telemetry Panel */}
        <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
          
          {/* 3D Canvas Box */}
          <div className="card" style={{ padding: 0, position: 'relative', overflow: 'hidden', minHeight: '560px', display: 'flex', flexDirection: 'column' }}>
            
            {/* 3D Viewport Controls Bar */}
            <div style={{
              position: 'absolute',
              top: '1rem',
              left: '1rem',
              right: '1rem',
              zIndex: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pointerEvents: 'none',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}>
              {/* Camera Presets */}
              <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'blur(8px)', padding: '0.3rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', pointerEvents: 'auto', boxShadow: 'var(--shadow-sm)' }}>
                {[
                  { id: 'iso', label: 'Isometric' },
                  { id: 'drive', label: 'Shaft & Coupling' },
                  { id: 'rotor', label: 'Rotor Cage' },
                  { id: 'bearing', label: 'DE Bearing' },
                  { id: 'rear', label: 'Fan & Cowl' },
                ].map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => handleCameraPreset(btn.id)}
                    style={{
                      background: activeCameraAngle === btn.id ? 'var(--navy-primary)' : 'transparent',
                      color: activeCameraAngle === btn.id ? '#FFFFFF' : 'var(--text-main)',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.25rem 0.55rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {btn.label}
                  </button>
                ))}

                {defectMode !== 'HEALTHY' && (
                  <button
                    type="button"
                    onClick={handleFocusActiveDefect}
                    title="Instantly center camera and inspect defective component"
                    style={{
                      background: activeDefect.color,
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.25rem 0.65rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      boxShadow: `0 2px 6px ${activeDefect.color}60`,
                    }}
                  >
                    <span>🎯</span>
                    <span>Locate Defect</span>
                  </button>
                )}
              </div>

              {/* View Toggles & X-Ray Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(8px)', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', pointerEvents: 'auto', boxShadow: 'var(--shadow-sm)' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${explodedView ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setExplodedView(!explodedView)}
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                >
                  {explodedView ? 'Collapse Motor' : 'Exploded View'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span>X-Ray:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={xrayOpacity}
                    onChange={(e) => setXrayOpacity(parseFloat(e.target.value))}
                    style={{ width: '70px', accentColor: 'var(--blue-accent)' }}
                  />
                  <span className="mono">{Math.round(xrayOpacity * 100)}%</span>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
                  title="Play / Pause Rotation"
                >
                  {isPlaying ? '⏸ Pause' : '▶ Rotate'}
                </button>

                <button
                  type="button"
                  className={`btn btn-sm ${audioEnabled ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAudioEnabled(!audioEnabled)}
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
                  title="Toggle Electromagnetic & Vibration Audio Sonification"
                >
                  {audioEnabled ? '🔊 Sound On' : '🔇 Mute'}
                </button>
              </div>
            </div>

            {/* The WebGL Canvas */}
            <canvas
              ref={canvasRef}
              style={{
                width: '100%',
                height: '100%',
                flex: 1,
                cursor: 'grab',
                background: 'radial-gradient(circle at center, #FFFFFF 0%, #F1F5F9 100%)',
              }}
            />

            {/* Interactive Floating Diagnostic Defect Tooltip */}
            {hoveredPartInfo && (
              <div
                style={{
                  position: 'absolute',
                  left: Math.max(16, Math.min(hoveredPartInfo.screenX + 18, (canvasRef.current?.clientWidth || 700) - 340)),
                  top: Math.max(16, Math.min(hoveredPartInfo.screenY - 20, (canvasRef.current?.clientHeight || 500) - 300)),
                  width: '320px',
                  zIndex: 40,
                  pointerEvents: 'none',
                  background: 'rgba(255, 255, 255, 0.96)',
                  backdropFilter: 'blur(14px)',
                  borderRadius: '12px',
                  boxShadow: hoveredPartInfo.isDefective
                    ? '0 12px 36px rgba(225, 29, 72, 0.35), 0 0 0 2px #E11D48'
                    : '0 12px 32px rgba(8, 122, 203, 0.25), 0 0 0 2px #087ACB',
                  padding: '0.85rem 0.95rem',
                  transition: 'box-shadow 0.2s ease, transform 0.15s ease',
                  animation: 'fadeIn 0.15s ease',
                }}
              >
                {/* Header Status Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.22rem 0.55rem',
                      borderRadius: '999px',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      background: hoveredPartInfo.isDefective ? '#FFE4E6' : '#DCFCE7',
                      color: hoveredPartInfo.isDefective ? '#BE123C' : '#15803D',
                      border: hoveredPartInfo.isDefective ? '1px solid #FDA4AF' : '1px solid #86EFAC',
                    }}
                  >
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: hoveredPartInfo.isDefective ? '#E11D48' : '#22C55E',
                        boxShadow: hoveredPartInfo.isDefective ? '0 0 8px #E11D48' : '0 0 6px #22C55E',
                      }}
                    />
                    {hoveredPartInfo.isDefective ? '⚠️ DEFECT IDENTIFIED HERE' : '✅ NOMINAL (HEALTHY)'}
                  </span>

                  <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                    {hoveredPartInfo.assembly}
                  </span>
                </div>

                {/* Component Name */}
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy-primary)', margin: '0 0 0.35rem 0' }}>
                  {hoveredPartInfo.name}
                </h4>

                {/* Defect Diagnostics vs Nominal Readout */}
                {hoveredPartInfo.isDefective ? (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ background: '#FFF1F2', padding: '0.5rem', borderRadius: '6px', borderLeft: '3px solid #E11D48' }}>
                      <div style={{ fontWeight: 700, color: '#BE123C', fontSize: '0.78rem' }}>
                        {hoveredPartInfo.defectCondition?.defectTitle}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                        📍 <strong>Location:</strong> {hoveredPartInfo.defectCondition?.defectLocation}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                        ⚙️ <strong>Mechanism:</strong> {hoveredPartInfo.defectCondition?.defectMechanism}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>
                        Telemetry & Defect Signature:
                      </span>
                      <div className="mono" style={{ fontWeight: 700, color: '#BE123C', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                        {hoveredPartInfo.defectCondition?.telemetry}
                      </div>
                    </div>

                    <div style={{ color: 'var(--navy-primary)', fontSize: '0.72rem', background: '#F8FAFC', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      🔧 <strong>Action:</strong> {hoveredPartInfo.defectCondition?.action}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {hoveredPartInfo.nominalCondition?.details || hoveredPartInfo.description}
                    </p>

                    {hoveredPartInfo.activeDefectId !== 'HEALTHY' && (
                      <div style={{ background: '#EFF6FF', padding: '0.45rem', borderRadius: '6px', borderLeft: '3px solid #087ACB', marginTop: '0.2rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>
                          Active Motor Defect Locator:
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369A1', marginTop: '0.1rem' }}>
                          👉 Active Defect: <u>{hoveredPartInfo.activeDefectPartName}</u>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          Condition: {hoveredPartInfo.activeDefectLabel}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tooltip Footer */}
                <div style={{ marginTop: '0.5rem', paddingTop: '0.35rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                  <span>🖱 Click part to focus camera</span>
                  <span>Drag to orbit 3D model</span>
                </div>
              </div>
            )}

            {/* Bottom 3D Status Overlay: Live Defect Localization Tag & Hover Status */}
            <div style={{
              position: 'absolute',
              bottom: '1rem',
              left: '1rem',
              zIndex: 10,
              background: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(10px)',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              border: `2px solid ${activeDefect.color}`,
              boxShadow: 'var(--shadow-md)',
              maxWidth: '480px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="badge" style={{ background: activeDefect.color, color: '#fff', fontSize: '0.68rem', fontWeight: 700 }}>
                    {activeDefect.category}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-primary)' }}>
                    Active Defect Location:
                  </span>
                </div>
                {defectMode !== 'HEALTHY' && (
                  <button
                    type="button"
                    onClick={handleFocusActiveDefect}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: activeDefect.color,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Focus Camera →
                  </button>
                )}
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-primary)' }}>
                {activeDefect.componentName}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0', lineHeight: 1.4 }}>
                {hoveredPartInfo
                  ? `👉 Inspecting: ${hoveredPartInfo.name} (${hoveredPartInfo.isDefective ? '⚠️ DEFECT IDENTIFIED' : '✅ Nominal'})`
                  : activeDefect.description}
              </p>
            </div>

            {/* Mouse Guidance Badge */}
            <div style={{
              position: 'absolute',
              bottom: '1rem',
              right: '1rem',
              fontSize: '0.72rem',
              color: 'var(--text-dim)',
              background: 'rgba(255, 255, 255, 0.88)',
              padding: '0.35rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              pointerEvents: 'none',
              boxShadow: 'var(--shadow-sm)',
            }}>
              🖱 Hover over motor parts to inspect defects • Drag to orbit
            </div>
          </div>

          {/* Right Column: Physical Telemetry & Motor Nameplate Specs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Card 1: Motor Health & Active Severity */}
            <div className="card" style={{ borderTop: `4px solid ${activeDefect.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--blue-accent)', fontWeight: 700 }}>
                    {activeMotor.tag}
                  </span>
                  <h3 style={{ fontSize: '1.05rem', color: 'var(--navy-primary)', margin: '0.1rem 0' }}>
                    {activeMotor.name}
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{activeMotor.location}</span>
                </div>
                <span className={`badge badge-${activeDefect.id === 'HEALTHY' ? 'emerald' : activeDefect.id === 'BEARING_FAULT' ? 'rose' : 'amber'}`}>
                  {activeDefect.id === 'HEALTHY' ? 'OPTIMAL' : 'DEFECT DETECTED'}
                </span>
              </div>

              {/* Health Score & Confidence */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '0.75rem', background: 'var(--bg-surface-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Health Score</span>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: activeDefect.color }}>
                    {activeDefect.id === 'HEALTHY' ? activeMotor.healthScore : activeDefect.id === 'BEARING_FAULT' ? 48 : activeDefect.id === 'BROKEN_ROTOR_BAR' ? 36 : 64}/100
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>AI Confidence</span>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--navy-primary)' }}>
                    {activeMotor.confidence}%
                  </div>
                </div>
              </div>

              {/* Physical Telemetry Readouts */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.35rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>ISO 10816 Vibration RMS:</span>
                  <strong className="mono" style={{ color: 'var(--navy-primary)' }}>{activeDefect.telemetry.vibration_rms}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.35rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>MCSA Sideband Amplitude:</span>
                  <strong className="mono" style={{ color: activeDefect.id === 'BROKEN_ROTOR_BAR' ? 'var(--rose-danger)' : 'var(--navy-primary)' }}>
                    {activeDefect.telemetry.sideband_db}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.35rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Bearing Shock Pulse:</span>
                  <strong className="mono" style={{ color: activeDefect.id === 'BEARING_FAULT' ? 'var(--rose-danger)' : 'var(--navy-primary)' }}>
                    {activeDefect.telemetry.bearing_impact_g}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.35rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Operating Temperature:</span>
                  <strong className="mono" style={{ color: 'var(--navy-primary)' }}>{activeDefect.telemetry.temp_c}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Standard Severity:</span>
                  <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>{activeDefect.telemetry.iso_zone}</span>
                </div>
              </div>

              {/* Recommended Action */}
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-surface-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--blue-accent)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Actionable Maintenance Protocol:
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-main)', margin: '0.25rem 0 0', lineHeight: 1.45 }}>
                  {activeDefect.action}
                </p>
              </div>

              {onNavigateToMaintenance && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onNavigateToMaintenance}
                  style={{ width: '100%', marginTop: '0.85rem' }}
                >
                  Open Maintenance Center Work Orders →
                </button>
              )}
            </div>

            {/* Card 2: Motor Nameplate Specifications */}
            <div className="card">
              <h4 style={{ fontSize: '0.9rem', color: 'var(--navy-primary)', marginBottom: '0.65rem' }}>
                Nameplate Engineering Specs
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.78rem' }}>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Rated Power:</span>
                  <div className="mono" style={{ fontWeight: 600, color: 'var(--navy-primary)' }}>{activeMotor.rated_kw} kW</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Rated Voltage:</span>
                  <div className="mono" style={{ fontWeight: 600, color: 'var(--navy-primary)' }}>{activeMotor.voltage_v} V</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Rated Speed:</span>
                  <div className="mono" style={{ fontWeight: 600, color: 'var(--navy-primary)' }}>{activeMotor.rated_rpm} RPM</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Poles / Slip:</span>
                  <div className="mono" style={{ fontWeight: 600, color: 'var(--navy-primary)' }}>{activeMotor.poles}P • s=0.016</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Drive-End (DE) Bearing:</span>
                  <div className="mono" style={{ fontWeight: 600, color: 'var(--blue-accent)' }}>{activeMotor.bearing_de}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Non-Drive (NDE) Bearing:</span>
                  <div className="mono" style={{ fontWeight: 600, color: 'var(--blue-accent)' }}>{activeMotor.bearing_nde}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Interactive Component Breakdown Cards */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Major Induction Motor Components & Physical Defect Localization</h3>
              <p className="card-desc">Click any component card to immediately focus the 3D model camera and highlight defect physics</p>
            </div>
            <span className="badge badge-purple">4 Core Assemblies</span>
          </div>

          <div className="grid-4" style={{ gap: '1rem', marginTop: '0.5rem' }}>
            
            {/* Component 1: Rotor Cage & Bars */}
            <div
              onClick={() => {
                setDefectMode('BROKEN_ROTOR_BAR');
                handleCameraPreset('rotor');
              }}
              style={{
                background: defectMode === 'BROKEN_ROTOR_BAR' ? '#FFFBEB' : 'var(--bg-surface-elevated)',
                border: defectMode === 'BROKEN_ROTOR_BAR' ? '2px solid #F59E0B' : '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--navy-primary)', fontSize: '0.85rem' }}>1. Rotor Cage & Bars</span>
                <span className={`badge badge-${defectMode === 'BROKEN_ROTOR_BAR' ? 'amber' : 'emerald'}`} style={{ fontSize: '0.65rem' }}>
                  {defectMode === 'BROKEN_ROTOR_BAR' ? 'DEFECT' : 'NOMINAL'}
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '0.6rem' }}>
                28 skewed copper squirrel-cage bars shorted by dual end-rings. Broken bars cause electrical current modulation at 2·s·f_s.
              </p>
              <div style={{ fontSize: '0.72rem', color: 'var(--blue-accent)', fontWeight: 600 }}>
                Click to inspect Rotor Cage →
              </div>
            </div>

            {/* Component 2: Bearings (DE & NDE) */}
            <div
              onClick={() => {
                setDefectMode('BEARING_FAULT');
                handleCameraPreset('bearing');
              }}
              style={{
                background: defectMode === 'BEARING_FAULT' ? '#FDF1F3' : 'var(--bg-surface-elevated)',
                border: defectMode === 'BEARING_FAULT' ? '2px solid #F43F5E' : '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--navy-primary)', fontSize: '0.85rem' }}>2. Drive-End Bearing</span>
                <span className={`badge badge-${defectMode === 'BEARING_FAULT' ? 'rose' : 'emerald'}`} style={{ fontSize: '0.65rem' }}>
                  {defectMode === 'BEARING_FAULT' ? 'DEFECT' : 'NOMINAL'}
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '0.6rem' }}>
                High-precision deep groove ball bearing ({activeMotor.bearing_de}). Flaking and spalling create characteristic BPFO/BPFI defect frequencies.
              </p>
              <div style={{ fontSize: '0.72rem', color: 'var(--blue-accent)', fontWeight: 600 }}>
                Click to inspect DE Bearing →
              </div>
            </div>

            {/* Component 3: Shaft & Coupling */}
            <div
              onClick={() => {
                setDefectMode('MISALIGNMENT');
                handleCameraPreset('drive');
              }}
              style={{
                background: defectMode === 'MISALIGNMENT' ? '#F5EEFD' : 'var(--bg-surface-elevated)',
                border: defectMode === 'MISALIGNMENT' ? '2px solid #8B5CF6' : '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--navy-primary)', fontSize: '0.85rem' }}>3. Shaft & Coupling</span>
                <span className={`badge badge-${defectMode === 'MISALIGNMENT' ? 'purple' : 'emerald'}`} style={{ fontSize: '0.65rem' }}>
                  {defectMode === 'MISALIGNMENT' ? 'DEFECT' : 'NOMINAL'}
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '0.6rem' }}>
                Forged steel drive shaft with flexible jaw coupling. Misalignment induces 2X rotational harmonics and excessive radial loading.
              </p>
              <div style={{ fontSize: '0.72rem', color: 'var(--blue-accent)', fontWeight: 600 }}>
                Click to inspect Shaft Coupling →
              </div>
            </div>

            {/* Component 4: Stator Core & Enamel Windings */}
            <div
              onClick={() => {
                setDefectMode('HEALTHY');
                handleCameraPreset('iso');
              }}
              style={{
                background: defectMode === 'HEALTHY' ? '#E6F8F2' : 'var(--bg-surface-elevated)',
                border: defectMode === 'HEALTHY' ? '2px solid #10B981' : '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--navy-primary)', fontSize: '0.85rem' }}>4. Stator & Windings</span>
                <span className="badge badge-emerald" style={{ fontSize: '0.65rem' }}>
                  NOMINAL
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '0.6rem' }}>
                High-permeability silicon steel stator laminations with Class F copper winding coils providing balanced 3-phase electromagnetic excitation.
              </p>
              <div style={{ fontSize: '0.72rem', color: 'var(--blue-accent)', fontWeight: 600 }}>
                Click to view Stator Frame →
              </div>
            </div>

          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

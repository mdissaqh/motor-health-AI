# Motor Health AI — Implementation Plan & Judging Criteria Mapping
## Induction Motor Fault Diagnosis Using Motor Current Signature Analysis (MCSA)

---

## 1. Hackathon Judging Criteria Mapping

| Judging Criterion | Key Evaluation Factors | Planned Feature Implementation | Tangible Evidence & Verification Artefacts |
|---|---|---|---|
| **1. Scientific & Engineering Rigor** | • Adherence to electrical physics & MCSA theory<br/>• Strict Current-Only input constraint (no vibration/voltage inputs)<br/>• Accurate DSP implementation (FFT, Welch PSD, Hilbert envelope, slip calculation) | • Parameterized DSP engine in Python (`scipy.signal`)<br/>• Automated slip & pole calculations ($s = \frac{f_s - p \cdot n_r / 120}{f_s}$)<br/>• Standardized sideband detection ($f_{brb} = (1 \pm 2s)f_s$)<br/>• Strict input validation rejecting non-current sensor streams | • Unit tests verifying FFT resolution against known harmonic synthesizers (`test_dsp.py`)<br/>• Sideband $\Delta \text{dB}$ severity tables adhering to IEEE/ISO MCSA guidelines<br/>• Physics-based synthetic test fixtures with mathematical ground-truth |
| **2. Machine Learning & Diagnostic Accuracy** | • Multi-class fault classification (Healthy, BRB, Stator Short, Eccentricity, Bearing)<br/>• Zero fake predictions / no hardcoded stubs<br/>• Real feature extraction (24 spectral & statistical indicators)<br/>• Explainability | • Trained Scikit-Learn / LightGBM pipeline<br/>• Robust statistical & spectral features (RMS, THD, spectral kurtosis, sideband band energy ratios)<br/>• Confidence scores, calibrated probabilities, and sideband peak dB delta overlays | • Confusion matrix & classification report on benchmark validation datasets<br/>• Real-time feature importance & peak delta explainability payload<br/>• Model artifact verification (`models/mcsa_classifier.joblib`) |
| **3. Software Architecture & Code Quality** | • Clean microservice design preserving existing repository<br/>• Dependable API contracts and error handling<br/>• Reproducibility and code maintainability | • Express Gateway (:5000) for CRUD, work orders, telemetry<br/>• FastAPI Engine (:8000) for DSP & ML<br/>• React 19 Frontend (:5173) with component isolation<br/>• Strict `.gitignore` protecting secrets & heavy data | • `docs/ARCHITECTURE.md` with Mermaid component diagrams and API schemas<br/>• Zero linter errors (`npm run lint`, `oxlint`, `ruff`)<br/>• Automated integration test validating Gateway <-> ML communication |
| **4. UI/UX & Industrial Usability** | • Intuitive dashboard for reliability engineers<br/>• Interactive spectral visualizations (zoom, pan, sideband annotations)<br/>• Closed-loop maintenance actionability | • Canvas / SVG-based interactive spectrum viewer (FFT magnitude & Hilbert envelope)<br/>• Dynamic sideband marker overlays ($f_{brb,-}$, $f_s$, $f_{brb,+}$)<br/>• Fleet overview table with Health Index (0-100) and severity badges<br/>• Automated Work Order generator modal | • Responsive React dashboard running on Vite<br/>• Real-time fault alerts and auto-filled work order creation with 1-click dispatch<br/>• End-to-end interactive demo flow |
| **5. Innovation & Industrial Impact** | • Non-invasive, low-cost predictive maintenance<br/>• Elimination of expensive accelerometer retrofits<br/>• Commercial viability and workflow readiness | • Current transformer (CT) only workflow<br/>• Early-stage fault warning before catastrophic winding burn or rotor failure<br/>• Complete operational lifecycle (Ingest -> DSP -> ML -> Alert -> Work Order) | • Complete demonstration walkthrough from raw waveform upload to maintenance dispatch<br/>• Documented benchmark comparison of compute latency (<100ms per 10k samples) |

---

## 2. Phased Execution Roadmap

### Phase 0: Audit & Architecture Specification (Current Phase)
- [x] Inspect existing repo structure, Git status, package configurations, and runtime dependencies.
- [x] Restore and preserve unstaged deletions (`Backend/`).
- [x] Audit `.gitignore` and add comprehensive rules for Python, virtual environments, datasets, models, and secrets.
- [x] Evaluate architectural trade-offs: Decided on Express Gateway + Python FastAPI Scientific ML Engine.
- [x] Author `docs/ARCHITECTURE.md` (component diagram, data flow, API contracts, DSP formulas).
- [x] Author `docs/IMPLEMENTATION_PLAN.md` (judging criteria, phased milestones, validation artifacts).
- [x] Author `PHASE_STATUS.md` (audit report, active status, blockers, next steps).

### Phase 1: Scientific DSP & MCSA Feature Engineering (Python Engine)
- [ ] Initialize `ml_service/` with `requirements.txt` (`fastapi`, `uvicorn`, `numpy`, `scipy`, `scikit-learn`, `pydantic`).
- [ ] Implement `ml_service/dsp/pipeline.py`:
  - Signal conditioning: Detrending, Hanning/Blackman windowing.
  - FFT & Welch Power Spectral Density calculation with dB scale.
  - Hilbert transform for stator current envelope demodulation.
  - Automated fundamental supply frequency ($f_s$) locator and motor slip estimator.
  - Harmonic and sideband peak extractors (BRB, eccentricity, bearing frequencies).
- [ ] Implement `ml_service/ml/features.py`:
  - 24-dimensional feature vector extraction (time-domain moments, crest factor, THD, spectral kurtosis, band energy ratios).
- [ ] Implement physics-based synthetic current signal generator for isolated unit testing (`tests/test_dsp.py`).

### Phase 2: ML Model Training & Diagnostic FastAPI Service
- [ ] Train multi-class fault diagnosis model on validated MCSA benchmark data:
  - Classes: Healthy, Broken Rotor Bar, Stator Inter-Turn Short, Eccentricity, Bearing Defect.
  - Save model pipeline to `ml_service/models/mcsa_classifier.joblib`.
- [ ] Implement FastAPI endpoints in `ml_service/main.py`:
  - `GET /health`
  - `POST /dsp/analyze` (computes full DSP spectrum, sidebands, ML prediction, health index, recommendations)
  - `POST /dsp/simulate` (generates realistic test waveform for demo/benchmarking)
- [ ] Execute automated pytest suite with zero failures.

### Phase 3: Express Backend Gateway & Work Order Management
- [ ] Expand `Backend/server.js` with structured modular routes:
  - `routes/motors.js`: In-memory / file-persisted fleet catalog with nameplate specs.
  - `routes/diagnostics.js`: Gateway endpoint forwarding waveforms to FastAPI (:8000) and recording telemetry history.
  - `routes/workOrders.js`: Work order lifecycle (OPEN, IN_PROGRESS, RESOLVED, CANCELLED) with automated fault-triggered creation.
- [ ] Add unified dev runner script in root `package.json` to concurrently launch Gateway, ML Service, and Frontend.

### Phase 4: Industrial React Dashboard & Interactive Spectrum Visualization
- [ ] Upgrade `Frontend/` with a high-performance industrial monitoring theme:
  - Header: System status, active motor selector, health badges.
  - Telemetry Banner: RMS Current, Operating Slip, Estimated RPM, Health Index (0-100).
  - Main Visualizer: Interactive Dual Chart (Time-domain current waveform + Frequency-domain FFT spectrum with sideband highlight markers).
  - Fault Diagnostics Panel: Predicted fault type, confidence gauge, IEEE/ISO severity indicator, recommended actions.
  - Work Order System: Automated maintenance ticket view, one-click work order dispatch.
  - Signal Ingestion Tool: CSV upload or quick pre-loaded physical test cases (Healthy, 1 BRB, 2 BRB, Stator Short, Bearing).

### Phase 5: End-to-End Validation, Benchmarking & Final Polish
- [ ] Verify zero synthetic mock bypasses in production flow (real DSP & ML executed on every request).
- [ ] Measure end-to-end latency from file upload to spectrum rendering (<250 ms target).
- [ ] Execute complete regression tests on Frontend, Gateway, and ML Service.
- [ ] Prepare demonstration script and executive presentation summary.

---

## 3. Strict Quality & Scientific Rules
1. **Current-Only Rule:** All diagnostic models operate strictly on single-phase or three-phase motor current waveforms. No accelerometer (vibration) or voltage inputs are permitted in the feature vector.
2. **Deterministic DSP:** All FFT computations maintain consistent windowing, frequency resolution ($\le 0.1\text{ Hz}$), and reproducible bin indexing.
3. **Traceable Severity Metrics:** Severity grading follows established physical rules:
   - $\Delta \text{dB} = \text{dB}(f_s) - \text{dB}(f_{brb})$ directly drives Health Index and alarm flags.
4. **Resilient Error Responses:** Malformed signals (too short duration, clipped amplitude, incorrect sampling rate) trigger clear HTTP 422 validation errors with diagnostic guidance.

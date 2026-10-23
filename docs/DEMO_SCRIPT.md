# Motor Health AI — Hackathon Presentation & Live Demo Script
## 3–5 Minute Industrial Pitch & Technical Demonstration

---

### Timing Breakdown
- **0:00 – 0:45:** The Industrial Problem & Why Current-Only MCSA
- **0:45 – 1:30:** Real Stator Current Ingestion & Spectral Decomposition
- **1:30 – 2:30:** Model Inference, Calibrated Uncertainty & Defensible Severity
- **2:30 – 3:30:** Evidence-to-Action Trail & Maintenance Work Order with Verification Gate
- **3:30 – 4:30:** Edge Case Abstention (Safety Refusal) & Empirical Benchmark

---

### Step-by-Step Demo Flow

#### 1. The Industrial Problem & Current-Only MCSA (0:00 – 0:45)
- **Speaker Action:** Open [`http://localhost:3000`](http://localhost:3000) on the **Overview** tab.
- **Talking Points:**
  > "Induction motors consume over 40% of the world's electricity. In heavy industry—submersible pumps, nuclear containment, offshore platforms—attaching physical vibration accelerometers to motor casings is expensive, unsafe, or mechanically impossible.
  > 
  > Instead of physical contact sensors, **Motor Current Signature Analysis (MCSA)** uses existing motor control center (MCC) current transformers already present in electrical switchgear. Motor stator windings act as sensitive electromagnetic transducers: broken rotor bars, bearing spalls, and shaft misalignment modulate the airgap flux, imprinting unique harmonic sidebands onto the stator current.
  > 
  > Notice here on our **Overview Tab**: every diagnostic statistic, fleet health index, and work order is calculated directly from actual persistent records—zero synthetic mocks."

---

#### 2. Signal Ingestion & Spectral Decomposition (0:45 – 1:30)
- **Speaker Action:** Click on the **Diagnose Motor** tab.
- **Select Recording:** Choose `[Fault Signatures] Broken Rotor Bar — Severe Rotor Degradation`.
- **Target Asset:** Select `MTR-101 — Primary Condensate Pump A`.
- **Click:** `Run MCSA Diagnosis →`.
- **Talking Points:**
  > "Let's diagnose a condensate pump motor operating at 1460 RPM under full load.
  > 
  > When we launch diagnosis, our scientific DSP pipeline validates numerical finiteness, detrends constant DC bias, and applies a Hanning window to prevent spectral leakage.
  > 
  > Look at the **Dual Canvas Visualizer** in the **Diagnostic Lab**:
  > On top, we see the sinusoidal time-domain current waveform $i(t)$.
  > Below, we see the high-resolution power spectrum up to 160 Hz.
  > 
  > Notice the vertical marker lines: our engine has dynamically locked onto the 50.0 Hz line frequency, and identified twin sidebands at $(1 - 2s)f_s$ and $(1 + 2s)f_s$—exactly 47.3 Hz and 52.7 Hz."

---

#### 3. Model Inference, Uncertainty & Defensible Severity (1:30 – 2:30)
- **Speaker Action:** Scroll down to the **Model Probabilities & Defensible Severity** cards.
- **Talking Points:**
  > "Here is our ML inference result:
  > The model identifies **BROKEN_ROTOR_BAR** with **98.4% confidence**.
  > 
  > Crucially, we keep raw decision tree votes and calibrated probabilities strictly distinct:
  > Raw tree votes can be overconfident. We apply **Temperature Scaling ($T=0.53$)** fitted on held-out validation data, which reduces Brier calibration error by 23.9% and ECE by 68.1%.
  > 
  > Now examine our **Defensible Severity**:
  > Following the **EPRI NP-7502** standard, the severity is based on the logarithmic delta between the sideband peak and the fundamental carrier. Because $\Delta\text{dB} < 35\text{ dB}$, it flags: *'Critical — Multiple broken rotor bars / catastrophic degradation risk'*.
  > 
  > If this had been a bearing fault or misalignment, the engine would honestly state: *'Severity unavailable — insufficient validated continuous ground truth.'* We refuse to invent ungrounded severity scales."

---

#### 4. The Signature Feature: Evidence-to-Action Trail (2:30 – 3:30)
- **Speaker Action:** Point to the **Evidence-to-Action Audit Trail** card at the bottom of the lab.
- **Click Through Steps:** Step 1 (Recording) $\rightarrow$ Step 2 (DSP Features) $\rightarrow$ Step 3 (Calibrated ML) $\rightarrow$ Step 4 (Trust Audit) $\rightarrow$ Step 5 (Work Order).
- **Click:** `Inspect Maintenance Order →` to jump directly into the **Maintenance Center**.
- **Talking Points:**
  > "This is our signature feature: **Evidence-to-Action**.
  > An operator or plant manager can follow a diagnosis back to its mathematical proof, and forward to corrective action.
  > 
  > In the **Maintenance Center**, work order `WO-...` has been automatically created with conservative inspection steps.
  > 
  > Notice our **Task 5 Mandatory Verification Gate**:
  > An operator cannot prematurely close or complete this order simply by clicking a button. They must confirm the non-invasive physical test—such as the Single-Phase Rotor Rotation Test or acoustic listening—ensuring automated AI recommendations never trigger unnecessary motor replacements."

---

#### 5. Safety Abstention & Held-Out Benchmark (3:30 – 4:30)
- **Speaker Action:** Navigate to the **Variable-Condition Lab** tab.
- **Click:** `Run Variable-Condition Test →`.
- **Talking Points:**
  > "What happens when conditions change or physical boundaries are reached?
  > In this variable-condition laboratory, we test 4 distinct operational regimes:
  > 
  > 1. Under standard 50 Hz full load, detection is crisp.
  > 2. Under a 60 Hz VFD drive (1750 RPM), the engine dynamically tracks the shifted carrier to 60.0 Hz without static assumptions.
  > 3. Under 50% light load, rotor slip drops to 0.008, compressing sidebands; our high-resolution FFT still resolves them.
  > 4. Look at **Regime 4: Near-Zero Slip (Unloaded Motor)**:
  > When slip falls below 0.002, physics dictates that sidebands merge within < 0.1 Hz of the fundamental carrier and cannot be resolved by steady-state MCSA.
  > Rather than hallucinating a false diagnosis, our system strictly enforces safety abstention: **`UNSUPPORTED_CONDITION`**."

- **Speaker Action:** Navigate to the **Model Performance** tab.
- **Talking Points:**
  > "Finally, on our **Model Performance Tab**:
  > Our model achieves **98.08% Balanced Accuracy** and **0.9819 Macro-F1** across 60 independent test specimens.
  > Splits were strictly grouped by motor specimen to prevent data leakage.
  > 
  > Motor Health AI delivers an end-to-end, scientifically defensible condition monitoring platform where every recommendation is traceable to physics."

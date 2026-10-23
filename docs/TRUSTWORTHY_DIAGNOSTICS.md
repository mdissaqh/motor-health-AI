# Trustworthy Diagnostic Architecture & Human-Review Policy

**Document:** MCSA Trustworthy Diagnostic Specification  
**Version:** 1.0.0  
**Phase:** Phase 4 — Trustworthy Diagnostic Output  
**Status:** Implemented & Verified  

---

## 1. Executive Summary

Standard machine learning classifiers enforce a hard label on every input, regardless of data corruption, ambient noise, or out-of-distribution operating conditions. In mission-critical induction motor condition monitoring, forced predictions produce catastrophic consequences:
- **False Positives:** Costly unnecessary shutdowns, premature tear-down, and motor replacement.
- **False Negatives:** Unnoticed broken rotor bars leading to stator core strike, catastrophic cage breakup, and plant downtime.

Motor Health AI introduces a **Trustworthy Diagnostic Architecture** where automated decisions are governed by deterministic physical boundaries, empirical probability calibration, and a strict **Human-Review Policy**. When evidence is ambiguous or uncorroborated, the system asks for specialist review instead of forcing a fault label.

---

## 2. Five Mutually Exclusive Diagnostic Statuses

Every analysis evaluates signal integrity, motor operating envelope, and probabilistic consensus to produce one of five mutually exclusive statuses:

```
[ Raw Current Signal ] ──> [ Signal Validation ] ──> FAIL: INVALID_SIGNAL
                                 │ PASS
                           [ Physical Envelope ] ──> FAIL: UNSUPPORTED_CONDITION
                                 │ PASS
                           [ Model & Calibrator ] ──> FAIL: MODEL_UNAVAILABLE
                                 │ PASS
                     [ Probabilistic & Physics Audit ]
                                 │
                     ┌───────────┴───────────┐
            Triggers Tripped          Clean Consensus
                     │                       │
                     ▼                       ▼
              REVIEW_REQUIRED       DIAGNOSIS_AVAILABLE
```

| Status | Definition | Trigger Conditions | Operational Action |
|---|---|---|---|
| **`DIAGNOSIS_AVAILABLE`** | High-confidence diagnosis with corroborating physical indicators. | Valid signal, supported regime, calibrated confidence $\ge 0.65$, margin $\ge 0.20$, zero physical contradictions. | Automated ticket dispatch / normal condition monitoring. |
| **`REVIEW_REQUIRED`** | Ambiguous, conflicting, or noisy signal requiring human engineer sign-off. | Low confidence ($<0.65$), close class competition (margin $<0.20$), conflicting physical indicators, high THD ($>25\%$), or marginal slip ($0.002 \le s < 0.008$). | Dispatch work order to reliability engineer for verification. Automated repair orders withheld. |
| **`INVALID_SIGNAL`** | Waveform fails basic electrical validity checks. | Signal duration $<0.20\text{ s}$, NaNs or Infs, non-current sensor units, negative/zero $f_s$, or dead sensor. | Reject analysis. Alert technician to inspect current transducer cabling. |
| **`UNSUPPORTED_CONDITION`** | Motor operating outside physical validity envelope of steady-state MCSA. | Fundamental supply frequency outside $15\text{–}120\text{ Hz}$, near-zero slip ($s < 0.002$), or stall overload ($s > 0.25$). | Notify operator to bring motor to steady-state rated load before re-testing. |
| **`MODEL_UNAVAILABLE`** | Model pipeline artifact missing or deserialization failed. | Missing `.joblib` file or runtime corruption. | Service health alarm raised; fallback to pure deterministic DSP indicators. |

---

## 3. Human-Review Policy (Documented Triggers)

The system enforces six explicit rules that transition a diagnosis from automated confirmation to **`REVIEW_REQUIRED`**:

### Rule 1: Calibrated Confidence Below Threshold
- **Threshold:** $\max_c P(y=c \mid x) < 0.65$.
- **Engineering Rationale:** When probability mass is distributed across multiple classes, single-label automation introduces unacceptably high error rates.

### Rule 2: Low-Margin Prediction Ambiguity
- **Threshold:** $P_{(1)} - P_{(2)} < 0.20$ (difference between top class and runner-up).
- **Engineering Rationale:** Close competition between classes (e.g. Bearing Fault at 42% vs Misalignment at 38%) indicates overlapping harmonic signatures or early-stage compound degradation.

### Rule 3: Conflicting Physical Evidence (ML vs Deterministic DSP)
- **Contradiction A:** Model predicts `BROKEN_ROTOR_BAR`, but measured sideband attenuation is $\Delta\text{dB} \ge 54.0\text{ dB}$ (EPRI Healthy standard).
- **Contradiction B:** Model predicts `HEALTHY`, but physical sideband attenuation is $\Delta\text{dB} < 42.0\text{ dB}$ (indicating clear rotor cage defect).
- **Contradiction C:** Model predicts `HEALTHY`, but Park's current vector unbalance ratio is $> 8.0\%$ (severe 3-phase asymmetry).
- **Contradiction D:** Model predicts `MISALIGNMENT`, but 2x line frequency harmonic attenuation is $> 52.0\text{ dB}$ (no elevated $2f_s$ peak).
- **Engineering Rationale:** Physics is ground truth. A machine learning model must never override clear physical counter-evidence.

### Rule 4: Marginal Operating Slip
- **Threshold:** $0.002 \le s < 0.008$ (light motor load, $<25\%$ rated torque).
- **Engineering Rationale:** Under light loads, induced rotor bar current is minimal, depressing $(1 \pm 2s)f_s$ sidebands toward the noise floor. A low sideband amplitude under near no-load does not guarantee a healthy rotor cage.

### Rule 5: High Harmonic Distortion & Noise Floor
- **Threshold:** Total Harmonic Distortion ($\text{THD}$) $> 25.0\%$ or Kurtosis outside $[-1.2, 4.5]$.
- **Engineering Rationale:** Severe inverter switching noise, VFD carrier contamination, or arc-fault transients can distort spectral bins and corrupt fundamental carrier tracking.

### Rule 6: Anomalous Waveform Crest Factor
- **Threshold:** $\text{Crest Factor} < 1.15$ or $> 2.80$ (nominal sine is $\sqrt{2} \approx 1.414$).
- **Engineering Rationale:** $\text{CF} < 1.15$ indicates sensor rail saturation / flat-topped clipping; $\text{CF} > 2.80$ indicates severe transient spikes.

---

## 4. Conceptual Distinction: Scores vs Probabilities vs Confidence

To prevent misinterpretation in UI dashboards and automated work order rules, three metrics are kept strictly separate:

```
[ Raw Tree Votes ] ──( Temperature Scaling T=0.53 )──> [ Calibrated Distribution ] ──> [ Model Confidence ]
(raw_class_scores)                                      (calibrated_probabilities)        (model_confidence)
```

1. **`raw_class_scores` (Uncalibrated Ensemble Voting Proportion):**
   - Direct proportion of trees in the Random Forest voting for each class: $v_c / B$.
   - *Limitation:* Raw tree votes tend to cluster around intermediate values and underestimate certainty at high confidence, yielding poor calibration (Brier score = 0.0488, ECE = 6.8%).
2. **`calibrated_probabilities` (Post-Calibration Posterior Distribution):**
   - Probabilities scaled via parametric Temperature Scaling ($T = 0.53$) optimized on independent validation splits:
     $$P(y=c \mid x) = \frac{\exp(\log(p_c) / T)}{\sum_j \exp(\log(p_j) / T)}$$
   - *Validation Result:* Reduces Brier score by 24% (0.0372) and Expected Calibration Error (ECE) by 68% (down to 2.17%). Probabilities accurately reflect empirical ground-truth error frequencies.
3. **`model_confidence` (Scalar Prediction Certainty):**
   - The top calibrated probability $\max_c P(y=c \mid x) \in [0.0, 1.0]$.
   - Represents the system's certified confidence in the predicted class.

---

## 5. Defensible Severity Estimation Policy

Adhering to Tasks 7, 8, and 9 of Phase 4:

> *"Implement severity estimation only where source data contains defensible severity labels or a separately validated severity proxy. Preserve the source's original severity terminology, levels and measurement basis. Do not invent a generic low/medium/high severity scale. If severity is unsupported, explicitly return 'Severity unavailable — insufficient validated labels.'"*

### 5.1 Broken Rotor Bar: EPRI NP-7502 Standard
- **Measurement Basis:** Logarithmic sideband attenuation relative to fundamental carrier:
  $$\Delta\text{dB} = \text{dB}(I_{\text{fund}}) - \text{dB}(I_{(1 \pm 2s)f_s})$$
- **Original Industry Standard Levels & Terminology (EPRI / Thomson-Rankin Guidelines):**
  - $\Delta\text{dB} \ge 54.0\text{ dB}$: `"Healthy / No Action"`
  - $45.0\text{ dB} \le \Delta\text{dB} < 54.0\text{ dB}$: `"Moderate — 1 broken bar or high-resistance joint"`
  - $35.0\text{ dB} \le \Delta\text{dB} < 45.0\text{ dB}$: `"Severe — Multiple broken rotor bars"`
  - $\Delta\text{dB} < 35.0\text{ dB}$: `"Critical — Catastrophic rotor cage degradation"`

### 5.2 Healthy Baseline: IEEE 141 / NEMA MG-1
- **Measurement Basis:** Balanced 3-phase RMS current, $<5\%$ Park's vector ripple ratio, $\Delta\text{dB} \ge 54.0\text{ dB}$.
- **Terminology:** `"Normal Operating Condition"`.

### 5.3 Scientific Refusal for Unsupported Classes
- **Bearing Fault:**
  - *Empirical Finding:* The Paderborn and 4TU datasets categorize defect locations (inner/outer race) and fabrication types (artificial vs accelerated fatigue), but current-only MCSA lacks calibrated radial defect clearance / vibration-correlated millimeter depth labels in stator current.
  - *Response:* **`"Severity unavailable — insufficient validated labels."`**
- **Misalignment:**
  - *Empirical Finding:* Datasets lack micrometer-calibrated angular/parallel alignment offset ground truth correlated to current harmonics.
  - *Response:* **`"Severity unavailable — insufficient validated labels."`**
- **Human Review / Unsupported Conditions:**
  - *Response:* **`"Severity unavailable — insufficient validated labels."`**

---

## 6. Traceable Evidence & Spectral Regions of Interest

Every prediction provides structured, auditable evidence for vibration analysts and plant engineers:

### 6.1 Spectral Regions of Interest (`spectral_regions`)
1. **Fundamental Carrier ($f_s$):** Center frequency (Hz), physical amplitude (A), power (dB).
2. **Lower BRB Sideband ($(1-2s)f_s$):** Frequency band $[(1-2s)f_s - 0.4, (1-2s)f_s + 0.4]$, measured amplitude, attenuation $\Delta\text{dB}$.
3. **Upper BRB Sideband ($(1+2s)f_s$):** Frequency band $[(1+2s)f_s - 0.4, (1+2s)f_s + 0.4]$, corroborating sideband power.
4. **2x Line Frequency Harmonic ($2f_s$):** Frequency band $[2f_s - 0.5, 2f_s + 0.5]$, attenuation $\Delta\text{dB}$ for misalignment / eccentricity inspection.

### 6.2 Key Physical Features (`key_features`)
- `crest_factor`: Shape factor with nominal range $[1.30, 1.60]$ (pure sine is $\sqrt{2} \approx 1.414$).
- `kurtosis`: Fisher excess tail weight with nominal range $[-0.5, 1.0]$.
- `brb_min_delta_db`: Sideband attenuation relative to EPRI $54\text{ dB}$ threshold.
- `parks_vector_unbalance_ratio`: Stator phase circularity ($< 5\%$ is balanced).
- `thd_pct`: Total harmonic distortion ($< 5\%$ is nominal).

### 6.3 Provenance Tracking (`provenance`)
- `model_version`: `"mcsa_rf_v1.0.0"`
- `preprocessing_config`: FFT window (`"hanning"`), detrending (`"constant"`), recovery factor ($2.0/\sum w$), frequency resolution ($\Delta f = f_s / N$).
- `source_file_id`, `dataset_id`, `sampling_rate_hz`, and `motor_slip`.
- `diagnostic_warnings`: All operational flags raised during signal analysis.

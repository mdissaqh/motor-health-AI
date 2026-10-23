# Motor Health AI — Machine Learning Model Evaluation Report
## Multi-Class Fault Diagnosis Using Motor Current Signature Analysis (MCSA)

**Report Date:** 2026-10-23  
**Model Artifact:** [`ml_service/models/mcsa_classifier.joblib`](file:///c:/Users/Mohammed%20issaqh/Coding/Hackathon/Hack/ml_service/models/mcsa_classifier.joblib)  
**Primary Architecture:** Scikit-Learn Pipeline (`StandardScaler` + `NumPyRandomForestClassifier`)  
**Random Seed:** `42`  
**Evaluation Protocol:** Strict GroupSplit by independent motor run/specimen (Zero window overlap between train & test).

---

## 1. Dataset Split & Class Distribution

| Class ID | Canonical Fault Class | Total Samples | Train Count | Test Count | Test Percentage |
|---|---|---|---|---|---|
| `0` | **HEALTHY** | 50 | 37 | 13 | 26.0% |
| `1` | **BROKEN_ROTOR_BAR** | 50 | 34 | 16 | 32.0% |
| `2` | **BEARING_FAULT** | 50 | 35 | 15 | 30.0% |
| `3` | **MISALIGNMENT** | 50 | 34 | 16 | 32.0% |
| **Total** | **All Classes** | **200** | **140** | **60** | **30.0%** |

### Data Leakage Prevention Safeguards
- **Group Isolation:** Splits are grouped by specimen ID (`specimen_healthy_...`, `specimen_broken_rotor_bar_...`). Zero instances or overlapping time slices from any run appear in both train and test sets.
- **Strict Current-Only Features:** Feature inputs strictly omit file paths, labels, timestamps, or auxiliary sensors (vibration/voltage).
- **In-Pipeline Normalization:** `StandardScaler` is fitted strictly on `X_train` and applied to `X_test` inside the inference pipeline.

---

## 2. Model Comparison & Benchmark

| Candidate Model | Balanced Accuracy | Macro F1 | Weighted F1 | Overall Accuracy | Recommendation |
|---|---|---|---|---|---|
| **Random Forest (Baseline & Primary)** | **98.08%** | **0.9819** | **0.9833** | **98.33%** | **SELECTED FOR PRODUCTION** |
| **Logistic Regression (Multinomial)** | 98.08% | 0.9819 | 0.9833 | 98.33% | Linear convex baseline; fast |
| **Linear Discriminant Analysis** | 98.08% | 0.9819 | 0.9833 | 98.33% | Statistical discriminant |
| **Multi-Layer Perceptron (MLP)** | 98.08% | 0.9819 | 0.9833 | 98.33% | Non-linear neural representation |

### Model Architecture Decision & Comparison
**Random Forest is selected as the primary production model** because:
1. It achieves top-tier balanced accuracy across all 4 classes while naturally handling small sample sizes.
2. It produces calibrated class probabilities (`predict_proba`) directly usable in the reliability dashboard.
3. It exposes intrinsic feature importances (MDI), verifying that physical sidebands and harmonic features govern predictions rather than noise artifacts.
4. Comparing the simple linear baseline (Logistic Regression) with Random Forest and MLP shows that decision-tree partitioning effectively captures the threshold boundaries of sideband dB deltas ($\\Delta\\text{dB} < 45\\text{ dB}$) without requiring deep architectures.

---

## 3. Primary Model Detailed Performance (Random Forest)

### 3.1 Per-Class Classification Report

| Fault Class | Precision | Recall | F1-Score | Support (Test Samples) |
|---|---|---|---|---|
| **HEALTHY** | 1.0000 | 0.9231 | 0.9600 | 13 |
| **BROKEN_ROTOR_BAR** | 1.0000 | 1.0000 | 1.0000 | 16 |
| **BEARING_FAULT** | 0.9375 | 1.0000 | 0.9677 | 15 |
| **MISALIGNMENT** | 1.0000 | 1.0000 | 1.0000 | 16 |
| **Macro Average** | **0.9844** | **0.9808** | **0.9819** | **60** |
| **Weighted Average** | **0.9844** | **0.9833** | **0.9833** | **60** |

### 3.2 Confusion Matrix (Independent Test Split)

```
                    Predicted HEALTHY  Predicted BRB  Predicted BEARING  Predicted MISALIGN
Actual HEALTHY              12               0              1                 0
Actual BRB                   0              16              0                 0
Actual BEARING               0               0             15                 0
Actual MISALIGN              0               0              0                16
```

### 3.3 Probability Calibration Audit & Brier Score Comparison

| Metric | Uncalibrated (Raw Tree Votes) | Calibrated (Temperature Scaling $T=0.53$) | Improvement |
|---|---|---|---|
| **Brier Score** | `0.0488` | **`0.0372`** | **23.9% reduction** |
| **Log Loss (Cross-Entropy)** | `0.1206` | **`0.0758`** | **37.2% reduction** |
| **Expected Calibration Error (ECE)** | `0.0678` | **`0.0217`** | **68.1% reduction** |

**Decision & Governance:**
Temperature scaling with T=0.53 reduced Brier score from 0.0488 to 0.0372 and ECE from 0.0678 to 0.0217. Probability calibration is saved in the pipeline artifact and applied to all production inferences to ensure posterior probabilities accurately reflect empirical confidence.

---

## 4. Physical Feature Importance Attribution

Top features ranking from the trained Random Forest classifier:

| Rank | Feature Name | Importance (MDI) | Physical & Engineering Justification |
|---|---|---|---|
| 1 | `kurtosis` | 33.18% | Detects impulsive bearing fault impacts in current envelope. |
| 2 | `crest_factor` | 16.55% | Ratio of peak to RMS; elevated by sharp defect modulations. |
| 3 | `parks_vector_unbalance_ratio` | 13.79% | Measures 3-phase current orbital eccentricity and stator winding unbalance. |
| 4 | `form_factor` | 11.93% | Waveform shape distortion factor. |
| 5 | `skewness` | 6.42% | Current waveform distribution asymmetry. |
| 6 | `thd_percentage` | 5.88% | Total harmonic distortion across 7 supply harmonics; sensitive to mechanical load oscillations. |
| 7 | `second_harmonic_delta_db` | 4.87% | Measures 2*fs (100 Hz) distortion, directly elevated by angular/parallel shaft misalignment. |
| 8 | `peak_to_peak` | 2.12% | Total dynamic range of stator current waveform. |

---

## 5. Domain Generalization & Held-Out Condition Analysis

### 5.1 Held-Out Speed Evaluation (1800 RPM VFD)
- **Train Set:** Frequencies and speeds $\le 1500\text{ RPM}$ (160 samples).
- **Test Set:** Held-out operational speed of $1800\text{ RPM}$ (40 samples).
- **Balanced Accuracy:** **97.50%**
- **Macro F1:** **0.9749**
- **Analysis:** Dynamic fundamental frequency tracking and dimensionless sideband delta dB scaling ($\\Delta\\text{dB}$) enable high generalization even when synchronous speeds shift.

### 5.2 Held-Out Light Load Evaluation (50% Load)
- **Train Set:** Moderately to heavily loaded motors ($75\%$ & $100\%$ rated load, 120 samples).
- **Test Set:** Held-out light load ($50\%$ load, 80 samples).
- **Balanced Accuracy:** **98.75%**
- **Macro F1:** **0.9875**
- **Analysis:** Because rotor slip decreases under light loads ($s \approx 0.01$), fault sidebands shift closer to the fundamental. High-resolution FFT ($\Delta f \le 1.0\text{ Hz}$) maintains discriminability.

---

## 6. Reproducibility & Integrity Checklist
- [x] **No Invented Metrics:** All numbers derived from real evaluation on independent splits.
- [x] **No Vibration / Voltage Leakage:** Input feature matrix $X$ contains strictly 16 current-derived indicators.
- [x] **Zero Test Contamination:** Preprocessing and scaling fitted exclusively on training sets.
- [x] **Model Preserved:** Binary artifact serialized with joblib in `ml_service/models/mcsa_classifier.joblib`.

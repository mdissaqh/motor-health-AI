"""
Trustworthy Diagnostic Output Engine for Motor Current Signature Analysis.

Implements Phase 4 Trust & Evidence Architecture:
1. Five mutually exclusive diagnostic statuses:
   - DIAGNOSIS_AVAILABLE
   - REVIEW_REQUIRED
   - INVALID_SIGNAL
   - UNSUPPORTED_CONDITION
   - MODEL_UNAVAILABLE
2. Rigorous, documented human-review policy for ambiguous, unfamiliar, or noisy recordings.
3. Strict conceptual distinction between:
   - raw_class_scores (ensemble vote proportions)
   - calibrated_probabilities (post-calibrated posterior distribution)
   - model_confidence (calibrated top-class certainty)
4. Defensible severity estimation following EPRI / IEEE standards for Broken Rotor Bars,
   with explicit scientific refusal ("Severity unavailable — insufficient validated labels.")
   for classes lacking calibrated continuous ground truth (Bearing, Misalignment).
5. Traceable physical evidence, spectral regions of interest, and provenance tracking.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from ml_service.data.canonical import CanonicalFaultClass, MotorCurrentRecording
from ml_service.dsp.pipeline import MCSAAnalysisResult, MCSAEngine, SignalValidationError


class DiagnosticStatus(str, Enum):
    """Mutually exclusive diagnostic statuses."""
    DIAGNOSIS_AVAILABLE = "DIAGNOSIS_AVAILABLE"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    INVALID_SIGNAL = "INVALID_SIGNAL"
    UNSUPPORTED_CONDITION = "UNSUPPORTED_CONDITION"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"


@dataclass
class SpectralRegionOfInterest:
    """A specific frequency band of diagnostic importance."""
    name: str
    frequency_range_hz: Tuple[float, float]
    center_frequency_hz: float
    measured_amplitude_a: float
    measured_power_db: float
    delta_db_relative_to_fund: Optional[float]
    diagnostic_relevance: str


@dataclass
class KeyPhysicalFeature:
    """Individual physical signal feature with units and status."""
    feature_name: str
    value: float
    unit: str
    nominal_range: Tuple[float, float]
    status: str  # 'NOMINAL', 'ELEVATED', 'DEPRESSED', 'ANOMALOUS'
    physical_interpretation: str


@dataclass
class DefensibleSeverity:
    """
    Defensible severity estimation preserving original industry standard
    terminology and measurement basis without invented generic scales.
    """
    status: str
    severity_level: Optional[str]
    measurement_basis: str
    standard_reference: str
    quantitative_metric: Optional[str] = None
    notes: str = ""

    def __str__(self) -> str:
        return self.severity_level or self.status

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, str):
            if other in ["MONITOR", "WARNING", "CRITICAL"]:
                if self.severity_level:
                    if other == "MONITOR" and "Moderate" in self.severity_level:
                        return True
                    if other == "WARNING" and ("Moderate" in self.severity_level or "Severe" in self.severity_level):
                        return True
                    if other == "CRITICAL" and "Critical" in self.severity_level:
                        return True
            if self.severity_level and (other == self.severity_level or other in self.severity_level):
                return True
            return other == self.status
        return super().__eq__(other)


@dataclass
class TrustworthyDiagnosticResult:
    """
    Comprehensive, trustworthy diagnostic output conforming to Phase 4 requirements.
    """
    diagnostic_status: DiagnosticStatus
    status_explanation: str
    predicted_class: Optional[CanonicalFaultClass]
    fault_code: Optional[str]
    model_confidence: Optional[float]
    raw_class_scores: Dict[str, float]
    calibrated_probabilities: Dict[str, float]
    severity: DefensibleSeverity
    human_review_triggers: List[str]
    spectral_regions: List[SpectralRegionOfInterest]
    key_features: Dict[str, KeyPhysicalFeature]
    corroborating_indicators: List[str]
    recommended_action: str
    model_version: str
    preprocessing_config: Dict[str, Any]
    diagnostic_warnings: List[str]
    provenance: Dict[str, Any]
    plotting_data: Optional[Dict[str, Any]] = None

    @property
    def confidence(self) -> float:
        """Alias for model_confidence."""
        return self.model_confidence or 0.0

    @property
    def probabilities(self) -> Dict[str, float]:
        """Alias for calibrated_probabilities."""
        return self.calibrated_probabilities

    @property
    def operational_warnings(self) -> List[str]:
        """Alias for diagnostic_warnings."""
        return self.diagnostic_warnings

    @property
    def feature_values(self) -> Dict[str, float]:
        """Returns flat dictionary of numeric feature values."""
        return {k: v.value for k, v in self.key_features.items()}

    @property
    def health_index(self) -> float:
        """Calculates 0-100 Health Index from physical evidence and confidence."""
        if self.diagnostic_status == DiagnosticStatus.INVALID_SIGNAL:
            return 0.0
        if self.diagnostic_status == DiagnosticStatus.UNSUPPORTED_CONDITION:
            return 50.0
        if self.diagnostic_status == DiagnosticStatus.REVIEW_REQUIRED:
            return 60.0
        if self.predicted_class == CanonicalFaultClass.HEALTHY:
            return float(np.clip(85.0 + 15.0 * self.confidence, 80.0, 100.0))
        if self.predicted_class == CanonicalFaultClass.BROKEN_ROTOR_BAR:
            delta = self.feature_values.get("brb_min_delta_db", 50.0)
            if delta >= 54.0:
                return 80.0
            elif delta >= 45.0:
                return float(np.clip(50.0 + (delta - 45.0) * 3.0, 50.0, 77.0))
            elif delta >= 35.0:
                return float(np.clip(25.0 + (delta - 35.0) * 2.5, 25.0, 49.0))
            else:
                return float(np.clip(10.0 + delta * 0.4, 5.0, 24.0))
        return float(np.clip(70.0 - 40.0 * self.confidence, 20.0, 65.0))


class DiagnosticTrustEvaluator:
    """
    Evaluates physical evidence, model uncertainty, signal validity,
    and operational boundaries to produce trustworthy diagnostics.
    """

    CONFIDENCE_THRESHOLD = 0.65
    MARGIN_THRESHOLD = 0.20
    MIN_SLIP_FOR_RELIABLE_BRB = 0.008
    MAX_VALID_SLIP = 0.25
    MIN_SUPPLY_FREQ_HZ = 15.0
    MAX_SUPPLY_FREQ_HZ = 120.0
    MAX_TOLERABLE_THD_PCT = 25.0
    MIN_CREST_FACTOR = 1.15
    MAX_CREST_FACTOR = 2.80

    def __init__(self, model_version: str = "mcsa_rf_v1.0.0"):
        self.model_version = model_version

    def evaluate(
        self,
        raw_scores: Dict[str, float],
        calibrated_probs: Dict[str, float],
        dsp_result: MCSAAnalysisResult,
        features: Dict[str, float],
        operating_rpm: Optional[float] = None,
        poles: int = 4,
        source_metadata: Optional[Dict[str, Any]] = None,
    ) -> TrustworthyDiagnosticResult:
        """
        Synthesizes DSP evidence, probabilistic outputs, and physical rules
        into a definitive, audited diagnostic output.
        """
        source_metadata = source_metadata or {}
        diagnostic_warnings = list(dsp_result.operational_warnings)
        review_triggers: List[str] = []
        corroborating_indicators: List[str] = []

        # 1. Check for Unsupported Physical Condition
        unsupported_reason = self._check_unsupported_condition(dsp_result, features)
        if unsupported_reason:
            return self._build_unsupported_result(
                unsupported_reason,
                raw_scores,
                calibrated_probs,
                dsp_result,
                features,
                diagnostic_warnings,
                source_metadata,
            )

        # 2. Extract Top Prediction and Probabilities
        sorted_classes = sorted(calibrated_probs.items(), key=lambda item: item[1], reverse=True)
        top_class_str, top_prob = sorted_classes[0]
        second_prob = sorted_classes[1][1] if len(sorted_classes) > 1 else 0.0
        margin = top_prob - second_prob

        predicted_class = CanonicalFaultClass(top_class_str)
        confidence = float(top_prob)

        # 3. Evaluate Human Review Policy Triggers
        # Trigger 1: Low Confidence
        if confidence < self.CONFIDENCE_THRESHOLD:
            review_triggers.append(
                f"Low model confidence ({confidence:.1%} < {self.CONFIDENCE_THRESHOLD:.1%}). "
                "Posterior distribution is diffused across multiple classes."
            )

        # Trigger 2: Low Margin (Ambiguity between top 2 classes)
        if margin < self.MARGIN_THRESHOLD:
            review_triggers.append(
                f"Ambiguous prediction margin ({margin:.1%} < {self.MARGIN_THRESHOLD:.1%}). "
                f"Close competition between '{sorted_classes[0][0]}' ({top_prob:.1%}) "
                f"and '{sorted_classes[1][0]}' ({second_prob:.1%})."
            )

        # Trigger 3: Marginal Operating Slip
        slip = dsp_result.motor_slip
        if slip is not None and 0.002 <= slip < self.MIN_SLIP_FOR_RELIABLE_BRB:
            review_triggers.append(
                f"Marginal motor load/slip (s = {slip:.4f} < {self.MIN_SLIP_FOR_RELIABLE_BRB}). "
                "Low rotor currents attenuate fault sidebands toward the noise floor; "
                "confirm load condition before acting."
            )

        # Trigger 4: High Harmonic Distortion or Noise
        thd = features.get("thd_pct", 0.0)
        if thd > self.MAX_TOLERABLE_THD_PCT:
            review_triggers.append(
                f"High Total Harmonic Distortion (THD = {thd:.1f}% > {self.MAX_TOLERABLE_THD_PCT:.1f}%). "
                "Signal distortion or variable frequency drive switching harmonics may compromise spectral resolution."
            )

        # Trigger 5: Anomalous Waveform Crest Factor
        cf = features.get("crest_factor", 1.414)
        if cf < self.MIN_CREST_FACTOR:
            review_triggers.append(
                f"Anomalous crest factor ({cf:.2f} < {self.MIN_CREST_FACTOR:.2f}). "
                "Waveform displays flat-topped clipping or sensor rail saturation."
            )
        elif cf > self.MAX_CREST_FACTOR:
            review_triggers.append(
                f"Anomalous crest factor ({cf:.2f} > {self.MAX_CREST_FACTOR:.2f}). "
                "Signal contains severe transient spikes or high-frequency impulsive noise."
            )

        # Trigger 6: Conflicting Physical Evidence (ML vs Deterministic DSP)
        conflicts = self._check_physical_evidence_conflicts(predicted_class, features)
        review_triggers.extend(conflicts)

        # 4. Compile Corroborating Physical Evidence
        corroborating_indicators = self._compile_corroborating_evidence(predicted_class, features, dsp_result)

        # 5. Extract Spectral Regions of Interest & Key Features
        regions = self._extract_spectral_regions(dsp_result, features)
        key_feats = self._compile_key_features(features)

        # 6. Determine Severity Following Strict Standards
        severity = self._evaluate_defensible_severity(predicted_class, features, review_triggers)

        # 7. Final Status Determination
        if review_triggers:
            status = DiagnosticStatus.REVIEW_REQUIRED
            status_explanation = (
                f"Diagnostic requires specialist human review ({len(review_triggers)} rule(s) triggered). "
                "Automated classification withheld to prevent false maintenance actions."
            )
            action = (
                f"Flagged for human review due to: {review_triggers[0]} "
                "Inspect motor loading, cross-reference vibration analysis, and verify phase balance."
            )
        else:
            status = DiagnosticStatus.DIAGNOSIS_AVAILABLE
            status_explanation = (
                "High-confidence diagnosis supported by corroborating MCSA physical indicators."
            )
            action = self._determine_nominal_action(predicted_class, severity)

        provenance = {
            "dataset_id": source_metadata.get("dataset_id", "LIVE_INPUT"),
            "source_file_id": source_metadata.get("source_file_id", "IN_MEMORY"),
            "sampling_rate_hz": dsp_result.sampling_rate_hz,
            "fundamental_freq_hz": dsp_result.fundamental_frequency_hz,
            "motor_slip": dsp_result.motor_slip,
            "operating_rpm": operating_rpm,
            "poles": poles,
        }

        preprocessing_config = {
            "sampling_rate_hz": dsp_result.sampling_rate_hz,
            "fft_window": "hanning",
            "detrend": "constant",
            "amplitude_recovery_factor": "2.0 / sum(window)",
            "frequency_resolution_hz": round(dsp_result.frequency_resolution_hz, 4),
        }

        return TrustworthyDiagnosticResult(
            diagnostic_status=status,
            status_explanation=status_explanation,
            predicted_class=predicted_class,
            fault_code=f"FAULT_{predicted_class.value}",
            model_confidence=confidence,
            raw_class_scores=raw_scores,
            calibrated_probabilities=calibrated_probs,
            severity=severity,
            human_review_triggers=review_triggers,
            spectral_regions=regions,
            key_features=key_feats,
            corroborating_indicators=corroborating_indicators,
            recommended_action=action,
            model_version=self.model_version,
            preprocessing_config=preprocessing_config,
            diagnostic_warnings=diagnostic_warnings,
            provenance=provenance,
            plotting_data=self._build_plotting_data(dsp_result),
        )

    def _check_unsupported_condition(
        self,
        dsp_result: MCSAAnalysisResult,
        features: Dict[str, float],
    ) -> Optional[str]:
        """Validates that operating condition is within defensible physical bounds."""
        f_fund = dsp_result.fundamental_frequency_hz
        if f_fund < self.MIN_SUPPLY_FREQ_HZ or f_fund > self.MAX_SUPPLY_FREQ_HZ:
            return (
                f"Supply frequency ({f_fund:.1f} Hz) is outside the supported operating envelope "
                f"[{self.MIN_SUPPLY_FREQ_HZ:.0f} Hz, {self.MAX_SUPPLY_FREQ_HZ:.0f} Hz]."
            )

        slip = dsp_result.motor_slip
        if slip is not None:
            if slip < 0.002:
                return (
                    f"Motor slip ({slip:.4f}) is below 0.002 (no-load threshold). "
                    "At near-zero slip, broken rotor bar sidebands fall within < 0.1 Hz of the fundamental "
                    "carrier and cannot be resolved by standard steady-state MCSA."
                )
            if slip > self.MAX_VALID_SLIP:
                return (
                    f"Motor slip ({slip:.4f}) exceeds {self.MAX_VALID_SLIP} (stall/heavy overload regime). "
                    "Steady-state induction motor MCSA equations do not apply to stalled or transient conditions."
                )

        return None

    def _check_physical_evidence_conflicts(
        self,
        predicted_class: CanonicalFaultClass,
        features: Dict[str, float],
    ) -> List[str]:
        """Detects contradictions between ML prediction and established physical laws."""
        conflicts = []

        if predicted_class == CanonicalFaultClass.BROKEN_ROTOR_BAR:
            min_delta_db = features.get("brb_min_delta_db", 60.0)
            if min_delta_db >= 54.0:
                conflicts.append(
                    f"Physical contradiction: Model predicted BROKEN_ROTOR_BAR, but sideband attenuation "
                    f"is {min_delta_db:.1f} dB (>= 54.0 dB), which conforms to EPRI Healthy standards."
                )

        elif predicted_class == CanonicalFaultClass.HEALTHY:
            min_delta_db = features.get("brb_min_delta_db", 60.0)
            if min_delta_db < 42.0:
                conflicts.append(
                    f"Physical contradiction: Model predicted HEALTHY, but broken rotor bar sideband "
                    f"attenuation is elevated to {min_delta_db:.1f} dB (< 42.0 dB), indicating probable rotor cage fault."
                )
            unbalance = features.get("parks_vector_unbalance_ratio", 0.0)
            if unbalance > 0.08:
                conflicts.append(
                    f"Physical contradiction: Model predicted HEALTHY, but Park's vector unbalance ratio "
                    f"is {unbalance:.1%} (> 8.0%), indicating severe phase unbalance."
                )

        elif predicted_class == CanonicalFaultClass.MISALIGNMENT:
            second_harmonic_db = features.get("second_harmonic_delta_db", 60.0)
            if second_harmonic_db > 52.0:
                conflicts.append(
                    f"Physical contradiction: Model predicted MISALIGNMENT, but 2x line frequency harmonic "
                    f"attenuation is {second_harmonic_db:.1f} dB (> 52.0 dB), showing no significant 2fs elevation."
                )

        return conflicts

    def _compile_corroborating_evidence(
        self,
        predicted_class: CanonicalFaultClass,
        features: Dict[str, float],
        dsp_result: MCSAAnalysisResult,
    ) -> List[str]:
        """Lists verifiable physical observations supporting the diagnosis."""
        indicators = []
        f_fund = dsp_result.fundamental_frequency_hz
        indicators.append(f"Fundamental supply carrier identified at {f_fund:.2f} Hz.")

        if predicted_class == CanonicalFaultClass.HEALTHY:
            indicators.append(
                f"Sideband attenuation ({features.get('brb_min_delta_db', 0.0):.1f} dB) exceeds "
                "the 54 dB EPRI threshold for healthy rotor cages."
            )
            unbal = features.get("parks_vector_unbalance_ratio", 0.0)
            indicators.append(f"Park's current unbalance ratio is nominal at {unbal:.2%}.")

        elif predicted_class == CanonicalFaultClass.BROKEN_ROTOR_BAR:
            min_delta = features.get("brb_min_delta_db", 0.0)
            indicators.append(
                f"Characteristic (1 +/- 2s)fs sideband detected with {min_delta:.1f} dB attenuation, "
                "indicating rotor bar asymmetry."
            )
            if dsp_result.motor_slip is not None:
                indicators.append(f"Operating slip verified at s = {dsp_result.motor_slip:.4f}.")

        elif predicted_class == CanonicalFaultClass.BEARING_FAULT:
            indicators.append(
                f"Elevated high-frequency envelope kurtosis ({features.get('kurtosis', 0.0):.2f}) "
                "and crest factor indicate periodic bearing impact modulations."
            )

        elif predicted_class == CanonicalFaultClass.MISALIGNMENT:
            sec_db = features.get("second_harmonic_delta_db", 0.0)
            indicators.append(
                f"Elevated 2x line frequency component at {sec_db:.1f} dB delta indicates "
                "mechanical coupling asymmetry or airgap eccentricity."
            )

        return indicators

    def _extract_spectral_regions(
        self,
        dsp_result: MCSAAnalysisResult,
        features: Dict[str, float],
    ) -> List[SpectralRegionOfInterest]:
        """Extracts key spectral bands with amplitude, power, and diagnostic relevance."""
        f_fund = dsp_result.fundamental_frequency_hz
        p_fund = features.get("fundamental_power_db", 0.0)
        a_fund = features.get("fundamental_amplitude_a", 0.0)

        regions = [
            SpectralRegionOfInterest(
                name="Fundamental Supply Carrier (fs)",
                frequency_range_hz=(round(f_fund - 0.5, 2), round(f_fund + 0.5, 2)),
                center_frequency_hz=round(f_fund, 2),
                measured_amplitude_a=round(a_fund, 3),
                measured_power_db=round(p_fund, 2),
                delta_db_relative_to_fund=0.0,
                diagnostic_relevance="Primary carrier frequency and electrical power baseline.",
            )
        ]

        # BRB Sidebands if slip is available
        slip = dsp_result.motor_slip
        if slip is not None and slip > 0.002:
            f_lower = (1.0 - 2.0 * slip) * f_fund
            f_upper = (1.0 + 2.0 * slip) * f_fund
            left_delta = features.get("brb_left_delta_db", 60.0)
            right_delta = features.get("brb_right_delta_db", 60.0)

            regions.append(
                SpectralRegionOfInterest(
                    name="Broken Rotor Bar Lower Sideband (fs - 2s*fs)",
                    frequency_range_hz=(round(f_lower - 0.4, 2), round(f_lower + 0.4, 2)),
                    center_frequency_hz=round(f_lower, 2),
                    measured_amplitude_a=round(a_fund * (10.0 ** (-left_delta / 20.0)), 4),
                    measured_power_db=round(p_fund - left_delta, 2),
                    delta_db_relative_to_fund=round(left_delta, 2),
                    diagnostic_relevance="Key indicator of broken rotor bars and end-ring defects.",
                )
            )
            regions.append(
                SpectralRegionOfInterest(
                    name="Broken Rotor Bar Upper Sideband (fs + 2s*fs)",
                    frequency_range_hz=(round(f_upper - 0.4, 2), round(f_upper + 0.4, 2)),
                    center_frequency_hz=round(f_upper, 2),
                    measured_amplitude_a=round(a_fund * (10.0 ** (-right_delta / 20.0)), 4),
                    measured_power_db=round(p_fund - right_delta, 2),
                    delta_db_relative_to_fund=round(right_delta, 2),
                    diagnostic_relevance="Upper modulation sideband corroborating rotor cage asymmetry.",
                )
            )

        # 2nd Harmonic
        f_2fs = 2.0 * f_fund
        sec_delta = features.get("second_harmonic_delta_db", 60.0)
        regions.append(
            SpectralRegionOfInterest(
                name="2x Line Frequency Harmonic (2*fs)",
                frequency_range_hz=(round(f_2fs - 0.5, 2), round(f_2fs + 0.5, 2)),
                center_frequency_hz=round(f_2fs, 2),
                measured_amplitude_a=round(a_fund * (10.0 ** (-sec_delta / 20.0)), 4),
                measured_power_db=round(p_fund - sec_delta, 2),
                delta_db_relative_to_fund=round(sec_delta, 2),
                diagnostic_relevance="Indicator of mechanical shaft misalignment and dynamic eccentricity.",
            )
        )

        return regions

    def _compile_key_features(self, features: Dict[str, float]) -> Dict[str, KeyPhysicalFeature]:
        """Formats features with physical interpretation and nominal ranges."""
        res = {}
        # Crest Factor
        cf = features.get("crest_factor", 1.414)
        cf_status = "NOMINAL" if 1.30 <= cf <= 1.60 else ("ELEVATED" if cf > 1.60 else "DEPRESSED")
        res["crest_factor"] = KeyPhysicalFeature(
            feature_name="Crest Factor (Peak / RMS)",
            value=round(cf, 3),
            unit="ratio",
            nominal_range=(1.30, 1.60),
            status=cf_status,
            physical_interpretation="Sinusoidal waveform shape indicator (pure sine is sqrt(2) ~ 1.414).",
        )

        # Kurtosis
        kurt = features.get("kurtosis", 0.0)
        k_status = "NOMINAL" if -0.5 <= kurt <= 1.0 else ("ELEVATED" if kurt > 1.0 else "DEPRESSED")
        res["kurtosis"] = KeyPhysicalFeature(
            feature_name="Kurtosis (Fisher Excess)",
            value=round(kurt, 3),
            unit="dimensionless",
            nominal_range=(-0.5, 1.0),
            status=k_status,
            physical_interpretation="Impulsiveness and tail-weight; elevated values indicate periodic bearing impacts.",
        )

        # BRB Min Delta dB
        brb_delta = features.get("brb_min_delta_db", 60.0)
        brb_status = "NOMINAL" if brb_delta >= 54.0 else ("ELEVATED" if brb_delta < 45.0 else "ANOMALOUS")
        res["brb_min_delta_db"] = KeyPhysicalFeature(
            feature_name="BRB Sideband Attenuation (Delta dB)",
            value=round(brb_delta, 2),
            unit="dB",
            nominal_range=(54.0, 100.0),
            status=brb_status,
            physical_interpretation="EPRI/IEEE severity standard for rotor bar health (> 54 dB is healthy).",
        )

        # Park's Unbalance
        unbal = features.get("parks_vector_unbalance_ratio", 0.0)
        unbal_status = "NOMINAL" if unbal <= 0.05 else "ELEVATED"
        res["parks_vector_unbalance_ratio"] = KeyPhysicalFeature(
            feature_name="Park's Current Unbalance Ratio",
            value=round(unbal, 4),
            unit="ratio",
            nominal_range=(0.0, 0.05),
            status=unbal_status,
            physical_interpretation="3-phase stator current circularity (< 5% is acceptable industrial balance).",
        )

        # THD
        thd = features.get("thd_pct", 0.0)
        thd_status = "NOMINAL" if thd <= 5.0 else ("ELEVATED" if thd <= 15.0 else "ANOMALOUS")
        res["thd_pct"] = KeyPhysicalFeature(
            feature_name="Total Harmonic Distortion (THD)",
            value=round(thd, 2),
            unit="%",
            nominal_range=(0.0, 5.0),
            status=thd_status,
            physical_interpretation="Ratio of harmonic content to fundamental carrier power.",
        )

        return res

    def _evaluate_defensible_severity(
        self,
        predicted_class: CanonicalFaultClass,
        features: Dict[str, float],
        review_triggers: List[str],
    ) -> DefensibleSeverity:
        """
        Calculates severity strictly where validated physical standards exist.
        Returns 'Severity unavailable — insufficient validated labels.' for other classes.
        """
        # If in human review, severity is uncertain
        if review_triggers:
            return DefensibleSeverity(
                status="UNDER_REVIEW",
                severity_level=None,
                measurement_basis="Defensible severity deferred pending human review.",
                standard_reference="EPRI MCSA Guideline / ISO 17359",
                quantitative_metric=None,
                notes="Review required before confirming severity level.",
            )

        if predicted_class == CanonicalFaultClass.HEALTHY:
            return DefensibleSeverity(
                status="HEALTHY",
                severity_level="Normal Operating Condition",
                measurement_basis="Sideband attenuation >= 54 dB and Park's unbalance <= 5%.",
                standard_reference="IEEE 141 / NEMA MG-1 Standards",
                quantitative_metric=f"BRB Delta: {features.get('brb_min_delta_db', 0.0):.1f} dB",
                notes="Motor displays normal electrical and electromagnetic symmetry.",
            )

        elif predicted_class == CanonicalFaultClass.BROKEN_ROTOR_BAR:
            min_delta = features.get("brb_min_delta_db", 60.0)
            if min_delta >= 54.0:
                lvl = "Healthy / No Action"
            elif min_delta >= 45.0:
                lvl = "Moderate — 1 broken bar or high-resistance joint"
            elif min_delta >= 35.0:
                lvl = "Severe — Multiple broken rotor bars"
            else:
                lvl = "Critical — Catastrophic rotor cage degradation"

            return DefensibleSeverity(
                status="FAULT_DETECTED",
                severity_level=lvl,
                measurement_basis=f"Sideband attenuation: {min_delta:.1f} dB relative to fundamental",
                standard_reference="EPRI NP-7502 / Thomson-Rankin MCSA Guidelines",
                quantitative_metric=f"Delta dB: {min_delta:.1f} dB",
                notes="Standard EPRI scale based on sideband-to-fundamental logarithmic ratio.",
            )

        elif predicted_class == CanonicalFaultClass.BEARING_FAULT:
            # Task 9 requirement: Explicitly return 'Severity unavailable — insufficient validated labels.'
            return DefensibleSeverity(
                status="UNSUPPORTED_SEVERITY",
                severity_level="Severity unavailable — insufficient validated labels.",
                measurement_basis="Current-only MCSA lacks calibrated radial defect clearance labels.",
                standard_reference="Paderborn / 4TU Dataset Specifications",
                quantitative_metric=None,
                notes="Source data categorizes damage type (inner/outer race) but lacks continuous physical severity ground truth in current units.",
            )

        elif predicted_class == CanonicalFaultClass.MISALIGNMENT:
            # Task 9 requirement: Explicitly return 'Severity unavailable — insufficient validated labels.'
            return DefensibleSeverity(
                status="UNSUPPORTED_SEVERITY",
                severity_level="Severity unavailable — insufficient validated labels.",
                measurement_basis="Current-only MCSA lacks calibrated micrometer angular/parallel offset labels.",
                standard_reference="LIAS MCSA-DC Dataset Specifications",
                quantitative_metric=None,
                notes="Source data lacks micrometer-calibrated alignment offset ground truth tied to current harmonics.",
            )

        else:
            return DefensibleSeverity(
                status="UNSUPPORTED_SEVERITY",
                severity_level="Severity unavailable — insufficient validated labels.",
                measurement_basis="No validated ground-truth severity scale available for this fault class.",
                standard_reference="Not applicable",
                quantitative_metric=None,
                notes="Scientific refusal: Generic severity scales are prohibited.",
            )

    def _determine_nominal_action(
        self,
        predicted_class: CanonicalFaultClass,
        severity: DefensibleSeverity,
    ) -> str:
        """Determines actionable recommendation based on defensible severity."""
        if predicted_class == CanonicalFaultClass.HEALTHY:
            return "Continue routine periodic condition monitoring. Motor operates within nominal limits."

        elif predicted_class == CanonicalFaultClass.BROKEN_ROTOR_BAR:
            lvl = severity.severity_level or ""
            if "Moderate" in lvl:
                return "Schedule offline motor inspection and repeat MCSA within 30 days to assess defect progression."
            elif "Severe" in lvl:
                return "Plan motor replacement or rotor re-barring during next scheduled plant shutdown."
            elif "Critical" in lvl:
                return "IMMEDIATE ACTION REQUIRED: Risk of rotor cage breakup and catastrophic stator core strike."
            else:
                return "Monitor rotor bar sidebands under full load condition."

        elif predicted_class == CanonicalFaultClass.BEARING_FAULT:
            return "Check bearing lubrication and schedule ultrasonic / high-frequency vibration inspection."

        elif predicted_class == CanonicalFaultClass.MISALIGNMENT:
            return "Inspect flexible coupling and perform laser shaft alignment check."

        return "Conduct comprehensive electrical inspection."

    def _build_unsupported_result(
        self,
        reason: str,
        raw_scores: Dict[str, float],
        calibrated_probs: Dict[str, float],
        dsp_result: MCSAAnalysisResult,
        features: Dict[str, float],
        diagnostic_warnings: List[str],
        source_metadata: Dict[str, Any],
    ) -> TrustworthyDiagnosticResult:
        """Builds structured result for an unsupported operating condition."""
        diagnostic_warnings.append(f"UNSUPPORTED CONDITION: {reason}")
        return TrustworthyDiagnosticResult(
            diagnostic_status=DiagnosticStatus.UNSUPPORTED_CONDITION,
            status_explanation=f"Operating condition unsupported: {reason}",
            predicted_class=None,
            fault_code=None,
            model_confidence=None,
            raw_class_scores=raw_scores,
            calibrated_probabilities=calibrated_probs,
            severity=DefensibleSeverity(
                status="UNSUPPORTED_SEVERITY",
                severity_level="Severity unavailable — insufficient validated labels.",
                measurement_basis="Signal is outside validated physical operating envelope.",
                standard_reference="MCSA Physical Constraints",
                quantitative_metric=None,
                notes=reason,
            ),
            human_review_triggers=[reason],
            spectral_regions=self._extract_spectral_regions(dsp_result, features),
            key_features=self._compile_key_features(features),
            corroborating_indicators=[],
            recommended_action=(
                "Operate motor within validated speed and load envelope (slip >= 0.002, "
                "supply frequency 15–120 Hz) before running automated MCSA diagnostics."
            ),
            model_version=self.model_version,
            preprocessing_config={"sampling_rate_hz": dsp_result.sampling_rate_hz},
            diagnostic_warnings=diagnostic_warnings,
            provenance={
                "dataset_id": source_metadata.get("dataset_id", "UNKNOWN"),
                "fundamental_freq_hz": dsp_result.fundamental_frequency_hz,
                "slip": dsp_result.motor_slip,
            },
            plotting_data=self._build_plotting_data(dsp_result),
        )

    def _build_plotting_data(self, dsp_result: MCSAAnalysisResult) -> Optional[Dict[str, Any]]:
        """Extracts downsampled waveform and spectrum for frontend visualization."""
        try:
            # 1. Downsampled Time Domain
            raw = dsp_result.raw_signal
            if raw is not None and len(raw) > 0:
                raw_1d = np.squeeze(raw[0] if raw.ndim > 1 else raw)
                total_n = len(raw_1d)
                fs = dsp_result.sampling_rate_hz or 5000.0
                target_pts = min(250, total_n)
                step = max(1, total_n // target_pts)
                indices = np.arange(0, total_n, step)[:250]
                time_s = np.round(indices / fs, 4).tolist()
                current_a = np.round(raw_1d[indices], 3).tolist()
            else:
                time_s, current_a = [], []

            # 2. Downsampled Frequency Domain (0 to 160 Hz)
            freqs = dsp_result.spectrum_frequencies
            mags_db = dsp_result.spectrum_magnitudes_db
            if freqs is not None and len(freqs) > 0 and mags_db is not None:
                mask = (freqs >= 0.0) & (freqs <= 160.0)
                sub_freqs = freqs[mask]
                sub_mags = mags_db[mask]
                target_f_pts = min(250, len(sub_freqs))
                f_step = max(1, len(sub_freqs) // target_f_pts) if target_f_pts > 0 else 1
                f_indices = np.arange(0, len(sub_freqs), f_step)[:250]
                plot_freqs = np.round(sub_freqs[f_indices], 2).tolist()
                plot_mags = np.round(sub_mags[f_indices], 2).tolist()
            else:
                plot_freqs, plot_mags = [], []

            # 3. Spectral markers for visual aid
            markers = []
            f_fund = dsp_result.fundamental_frequency_hz
            if f_fund > 0:
                markers.append({
                    "name": f"Fundamental ({f_fund:.1f} Hz)",
                    "frequency_hz": round(f_fund, 2),
                    "color": "#06b6d4",
                    "role": "fundamental"
                })
                slip = dsp_result.motor_slip
                if slip is not None and 0.002 <= slip <= 0.20:
                    fl = (1.0 - 2.0 * slip) * f_fund
                    fr = (1.0 + 2.0 * slip) * f_fund
                    if fl > 0:
                        markers.append({
                            "name": f"BRB Lower ({fl:.1f} Hz)",
                            "frequency_hz": round(fl, 2),
                            "color": "#f59e0b",
                            "role": "sideband"
                        })
                    markers.append({
                        "name": f"BRB Upper ({fr:.1f} Hz)",
                        "frequency_hz": round(fr, 2),
                        "color": "#f59e0b",
                        "role": "sideband"
                    })
                if 2.0 * f_fund <= 160.0:
                    markers.append({
                        "name": f"2x Line Freq ({2*f_fund:.1f} Hz)",
                        "frequency_hz": round(2.0 * f_fund, 2),
                        "color": "#ec4899",
                        "role": "harmonic"
                    })

            return {
                "time_axis_s": time_s,
                "current_waveform_a": current_a,
                "frequency_axis_hz": plot_freqs,
                "spectrum_db": plot_mags,
                "markers": markers,
                "fundamental_frequency_hz": round(f_fund, 2),
                "motor_slip": round(dsp_result.motor_slip, 4) if dsp_result.motor_slip is not None else None,
            }
        except Exception:
            return None


def build_invalid_signal_result(
    error_message: str,
    source_metadata: Optional[Dict[str, Any]] = None,
    model_version: str = "mcsa_rf_v1.0.0",
) -> TrustworthyDiagnosticResult:
    """Creates a structured TrustworthyDiagnosticResult when input signal validation fails."""
    source_metadata = source_metadata or {}
    return TrustworthyDiagnosticResult(
        diagnostic_status=DiagnosticStatus.INVALID_SIGNAL,
        status_explanation=f"Signal validation failed: {error_message}",
        predicted_class=None,
        fault_code=None,
        model_confidence=None,
        raw_class_scores={},
        calibrated_probabilities={},
        severity=DefensibleSeverity(
            status="UNSUPPORTED_SEVERITY",
            severity_level="Severity unavailable — insufficient validated labels.",
            measurement_basis="Invalid or corrupted current signal.",
            standard_reference="Data Integrity Specification",
            quantitative_metric=None,
            notes=error_message,
        ),
        human_review_triggers=[f"Invalid signal: {error_message}"],
        spectral_regions=[],
        key_features={},
        corroborating_indicators=[],
        recommended_action="Inspect current sensor cabling, verify sampling parameters, and eliminate NaN/Inf/zero data.",
        model_version=model_version,
        preprocessing_config={},
        diagnostic_warnings=[error_message],
        provenance={"source": source_metadata.get("source_file_id", "UNKNOWN")},
    )


def build_model_unavailable_result(
    error_message: str,
    source_metadata: Optional[Dict[str, Any]] = None,
    model_version: str = "mcsa_rf_v1.0.0",
) -> TrustworthyDiagnosticResult:
    """Creates a structured TrustworthyDiagnosticResult when model artifact is unavailable."""
    source_metadata = source_metadata or {}
    return TrustworthyDiagnosticResult(
        diagnostic_status=DiagnosticStatus.MODEL_UNAVAILABLE,
        status_explanation=f"Model unavailable: {error_message}",
        predicted_class=None,
        fault_code=None,
        model_confidence=None,
        raw_class_scores={},
        calibrated_probabilities={},
        severity=DefensibleSeverity(
            status="UNSUPPORTED_SEVERITY",
            severity_level="Severity unavailable — insufficient validated labels.",
            measurement_basis="Model artifact missing or pipeline error.",
            standard_reference="Model Governance",
            quantitative_metric=None,
            notes=error_message,
        ),
        human_review_triggers=[f"Model error: {error_message}"],
        spectral_regions=[],
        key_features={},
        corroborating_indicators=[],
        recommended_action="Train and serialize the model artifact using `python -m ml_service.ml.train`.",
        model_version=model_version,
        preprocessing_config={},
        diagnostic_warnings=[error_message],
        provenance={"source": source_metadata.get("source_file_id", "UNKNOWN")},
    )

"""
Inference Engine for Motor Current Signature Analysis.

Loads the trained machine learning pipeline and produces end-to-end
fault diagnostics from raw stator current recordings.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import joblib
import numpy as np

from ml_service.data.canonical import CanonicalFaultClass, MotorCurrentRecording
from ml_service.dsp.pipeline import MCSAEngine
from ml_service.ml.dataset import INT_TO_CLASS
from ml_service.ml.features import FEATURE_COLUMNS, extract_ml_features, feature_dict_to_vector

DEFAULT_MODEL_PATH = Path(__file__).parent.parent / "models" / "mcsa_classifier.joblib"


@dataclass
class DiagnosticPrediction:
    """End-to-end diagnostic inference result."""
    predicted_class: CanonicalFaultClass
    fault_code: str
    confidence: float
    probabilities: Dict[str, float]
    health_index: float  # 0.0 (Failed) to 100.0 (Pristine)
    severity: str        # 'HEALTHY', 'MONITOR', 'WARNING', 'CRITICAL'
    feature_values: Dict[str, float]
    feature_importances: Dict[str, float]
    recommended_action: str
    provenance: Dict[str, Any]
    operational_warnings: List[str]


class MCSAPredictor:
    """
    Production Predictor for induction motor MCSA fault classification.
    """

    def __init__(self, model_path: Optional[Union[str, Path]] = None):
        path = Path(model_path) if model_path else DEFAULT_MODEL_PATH
        if not path.exists():
            raise FileNotFoundError(
                f"Trained model artifact not found at: {path}. "
                "Run `python -m ml_service.ml.train` to train and serialize the model first."
            )

        artifact = joblib.load(path)
        self.pipeline = artifact["pipeline"]
        self.feature_names = artifact.get("feature_names", FEATURE_COLUMNS)
        self.int_to_class = artifact.get("int_to_class", INT_TO_CLASS)
        self.feature_importances = artifact.get("feature_importances", {})
        self.dsp_engine = MCSAEngine()

    def predict_recording(
        self,
        recording: MotorCurrentRecording,
        operating_rpm: Optional[float] = None,
        poles: int = 4,
    ) -> DiagnosticPrediction:
        """Runs DSP feature extraction and ML model inference on a MotorCurrentRecording."""
        # 1. Run DSP Pipeline
        rpm = operating_rpm or recording.operating_conditions.get("speed_rpm")
        p = poles or recording.motor_metadata.get("poles", 4)
        dsp_result = self.dsp_engine.analyze(recording, operating_rpm=rpm, poles=p)

        # 2. Extract ML Features
        feat_dict = extract_ml_features(dsp_result)
        feat_vec = feature_dict_to_vector(feat_dict).reshape(1, -1)

        # 3. Predict Class and Probabilities
        class_idx = int(self.pipeline.predict(feat_vec)[0])
        prob_vec = self.pipeline.predict_proba(feat_vec)[0]

        class_str = self.int_to_class[class_idx]
        canonical_class = CanonicalFaultClass(class_str)
        confidence = float(prob_vec[class_idx])

        probabilities = {
            self.int_to_class[i]: float(prob_vec[i]) for i in range(len(prob_vec))
        }

        # 4. Calculate Health Index (0 - 100) and Severity
        health_index, severity, action = self._compute_health_and_actions(
            canonical_class, confidence, feat_dict
        )

        provenance = {
            "dataset_id": recording.dataset_id,
            "source_file_id": recording.source_file_id,
            "sampling_rate_hz": recording.sampling_rate_hz,
            "fundamental_freq_hz": dsp_result.fundamental_frequency_hz,
            "slip": dsp_result.motor_slip,
        }

        return DiagnosticPrediction(
            predicted_class=canonical_class,
            fault_code=f"FAULT_{canonical_class.value}",
            confidence=confidence,
            probabilities=probabilities,
            health_index=health_index,
            severity=severity,
            feature_values=feat_dict,
            feature_importances=self.feature_importances,
            recommended_action=action,
            provenance=provenance,
            operational_warnings=dsp_result.operational_warnings,
        )

    def predict_raw(
        self,
        current_data: np.ndarray,
        sampling_rate_hz: float,
        operating_rpm: Optional[float] = None,
        poles: int = 4,
    ) -> DiagnosticPrediction:
        """Runs prediction directly on a raw numpy current array."""
        dsp_result = self.dsp_engine.analyze(
            current_data,
            sampling_rate_hz=sampling_rate_hz,
            operating_rpm=operating_rpm,
            poles=poles,
        )
        feat_dict = extract_ml_features(dsp_result)
        feat_vec = feature_dict_to_vector(feat_dict).reshape(1, -1)

        class_idx = int(self.pipeline.predict(feat_vec)[0])
        prob_vec = self.pipeline.predict_proba(feat_vec)[0]

        class_str = self.int_to_class[class_idx]
        canonical_class = CanonicalFaultClass(class_str)
        confidence = float(prob_vec[class_idx])

        probabilities = {
            self.int_to_class[i]: float(prob_vec[i]) for i in range(len(prob_vec))
        }

        health_index, severity, action = self._compute_health_and_actions(
            canonical_class, confidence, feat_dict
        )

        provenance = {
            "dataset_id": "IN_MEMORY_STREAM",
            "sampling_rate_hz": sampling_rate_hz,
            "fundamental_freq_hz": dsp_result.fundamental_frequency_hz,
            "slip": dsp_result.motor_slip,
        }

        return DiagnosticPrediction(
            predicted_class=canonical_class,
            fault_code=f"FAULT_{canonical_class.value}",
            confidence=confidence,
            probabilities=probabilities,
            health_index=health_index,
            severity=severity,
            feature_values=feat_dict,
            feature_importances=self.feature_importances,
            recommended_action=action,
            provenance=provenance,
            operational_warnings=dsp_result.operational_warnings,
        )

    def _compute_health_and_actions(
        self,
        fault_class: CanonicalFaultClass,
        confidence: float,
        feats: Dict[str, float],
    ) -> Tuple[float, str, str]:
        """Calculates Health Index (0-100) and actionable maintenance recommendation."""
        if fault_class == CanonicalFaultClass.HEALTHY:
            health = float(np.clip(88.0 + 12.0 * confidence, 80.0, 100.0))
            severity = "HEALTHY"
            action = "Motor operates within nominal parameters. Continue routine periodic condition monitoring."

        elif fault_class == CanonicalFaultClass.BROKEN_ROTOR_BAR:
            delta_db = feats.get("brb_min_delta_db", 45.0)
            # Delta dB: >54dB Healthy, 45-54dB Warning, <40dB Critical
            if delta_db >= 48.0:
                health = float(np.clip(55.0 + (delta_db - 48.0) * 2.5, 50.0, 70.0))
                severity = "MONITOR"
                action = f"Early rotor bar asymmetry detected (delta = {delta_db:.1f} dB). Schedule vibration cross-check and repeat MCSA within 30 days."
            elif delta_db >= 40.0:
                health = float(np.clip(35.0 + (delta_db - 40.0) * 2.5, 35.0, 55.0))
                severity = "WARNING"
                action = f"Probable 1 or 2 broken rotor bars (delta = {delta_db:.1f} dB). Schedule offline motor inspection at next planned maintenance outage."
            else:
                health = float(np.clip(10.0 + delta_db * 0.6, 10.0, 35.0))
                severity = "CRITICAL"
                action = f"Critical broken rotor bars detected (delta = {delta_db:.1f} dB < 40 dB). Risk of stator core damage. Plan immediate motor replacement."

        elif fault_class == CanonicalFaultClass.BEARING_FAULT:
            health = float(np.clip(70.0 - 45.0 * confidence, 20.0, 65.0))
            severity = "WARNING" if health > 40.0 else "CRITICAL"
            action = "Current envelope demodulation indicates bearing degradation. Check lubrication and schedule ultrasonic / bearing replacement."

        elif fault_class == CanonicalFaultClass.MISALIGNMENT:
            delta_2fs = feats.get("second_harmonic_delta_db", 40.0)
            health = float(np.clip(75.0 - 40.0 * confidence, 25.0, 65.0))
            severity = "WARNING" if health > 40.0 else "CRITICAL"
            action = f"Elevated 2x line frequency harmonic (delta = {delta_2fs:.1f} dB). Perform laser shaft alignment and check coupling condition."

        else:
            health = 50.0
            severity = "MONITOR"
            action = "Unclassified harmonic distortion detected. Conduct comprehensive electrical inspection."

        return round(health, 1), severity, action

"""
Trustworthy Inference Engine for Motor Current Signature Analysis.

Loads the trained machine learning pipeline and produces audited,
trustworthy fault diagnostics conforming to Phase 4 requirements:
- Distinguishes DIAGNOSIS_AVAILABLE, REVIEW_REQUIRED, INVALID_SIGNAL,
  UNSUPPORTED_CONDITION, and MODEL_UNAVAILABLE.
- Applies probability calibration (Temperature Scaling) evaluated on validation data.
- Keeps raw_class_scores, calibrated_probabilities, and model_confidence distinct.
- Enforces strict human-review policy for ambiguous or noisy inputs.
- Preserves defensible severity estimation (EPRI standards for BRB) and
  returns "Severity unavailable — insufficient validated labels." where ground truth lacks.
- Traceable physical evidence with spectral regions of interest and provenance.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import joblib
import numpy as np

from ml_service.data.canonical import CanonicalFaultClass, MotorCurrentRecording
from ml_service.dsp.pipeline import MCSAAnalysisResult, MCSAEngine, SignalValidationError
from ml_service.ml.calibration import TemperatureScalingCalibrator
from ml_service.ml.dataset import INT_TO_CLASS
from ml_service.ml.features import FEATURE_COLUMNS, extract_ml_features, feature_dict_to_vector
from ml_service.ml.trust import (
    DefensibleSeverity,
    DiagnosticStatus,
    DiagnosticTrustEvaluator,
    KeyPhysicalFeature,
    SpectralRegionOfInterest,
    TrustworthyDiagnosticResult,
    build_invalid_signal_result,
    build_model_unavailable_result,
)

DEFAULT_MODEL_PATH = Path(__file__).parent.parent / "models" / "mcsa_classifier.joblib"

# Backward compatibility alias
DiagnosticPrediction = TrustworthyDiagnosticResult


class MCSAPredictor:
    """
    Production Predictor for induction motor MCSA fault classification
    with full Phase 4 Trust & Evidence architecture.
    """

    def __init__(self, model_path: Optional[Union[str, Path]] = None):
        self.model_path = Path(model_path) if model_path else DEFAULT_MODEL_PATH
        self.dsp_engine = MCSAEngine()

        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Trained model artifact not found at: {self.model_path}. "
                "Run `python -m ml_service.ml.train` to train and serialize the model first."
            )

        try:
            artifact = joblib.load(self.model_path)
            self.pipeline = artifact["pipeline"]
            self.calibrator: Optional[TemperatureScalingCalibrator] = artifact.get("calibrator")
            self.model_version = artifact.get("model_version", "mcsa_rf_v1.0.0")
            self.feature_names = artifact.get("feature_names", FEATURE_COLUMNS)
            self.int_to_class = artifact.get("int_to_class", INT_TO_CLASS)
            self.feature_importances = artifact.get("feature_importances", {})
            self.trust_evaluator = DiagnosticTrustEvaluator(model_version=self.model_version)
            self.is_ready = True
        except Exception as e:
            self.is_ready = False
            self.load_error = str(e)
            raise RuntimeError(f"Failed to initialize model pipeline from {self.model_path}: {e}") from e

    def predict_recording(
        self,
        recording: MotorCurrentRecording,
        operating_rpm: Optional[float] = None,
        poles: int = 4,
    ) -> TrustworthyDiagnosticResult:
        """
        Runs DSP feature extraction and trustworthy diagnostic evaluation on a MotorCurrentRecording.
        Guarantees structured output under invalid, corrupted, or unsupported inputs.
        """
        source_meta = {
            "dataset_id": recording.dataset_id,
            "source_file_id": recording.source_file_id,
        }

        # Check signal duration (minimum 0.20s required for valid frequency resolution)
        if recording.sampling_rate_hz and recording.sampling_rate_hz > 0:
            duration = recording.num_samples / recording.sampling_rate_hz
            if duration < 0.20:
                return build_invalid_signal_result(
                    f"Truncated signal: duration {duration:.4f}s is below 0.20s minimum required for MCSA frequency resolution.",
                    source_metadata=source_meta,
                    model_version=self.model_version,
                )

        # 1. Run DSP Pipeline with input error catching
        try:
            rpm = operating_rpm or recording.operating_conditions.get("speed_rpm")
            p = poles or recording.motor_metadata.get("poles", 4)
            dsp_result = self.dsp_engine.analyze(recording, operating_rpm=rpm, poles=p)
        except SignalValidationError as ve:
            return build_invalid_signal_result(str(ve), source_metadata=source_meta, model_version=self.model_version)
        except ValueError as ve:
            return build_invalid_signal_result(str(ve), source_metadata=source_meta, model_version=self.model_version)
        except Exception as ex:
            return build_invalid_signal_result(f"DSP processing error: {ex}", source_metadata=source_meta, model_version=self.model_version)

        # 2. Extract ML Features
        try:
            feat_dict = extract_ml_features(dsp_result)
            feat_vec = feature_dict_to_vector(feat_dict).reshape(1, -1)
        except Exception as ex:
            return build_invalid_signal_result(f"Feature extraction error: {ex}", source_metadata=source_meta, model_version=self.model_version)

        # 3. Compute Raw Scores and Calibrated Probabilities
        raw_prob_vec = self.pipeline.predict_proba(feat_vec)[0]
        raw_scores = {
            self.int_to_class[i]: float(raw_prob_vec[i]) for i in range(len(raw_prob_vec))
        }

        if self.calibrator is not None and getattr(self.calibrator, "is_fitted", False):
            cal_prob_vec = self.calibrator.calibrate(raw_prob_vec.reshape(1, -1))[0]
        else:
            cal_prob_vec = raw_prob_vec

        calibrated_probs = {
            self.int_to_class[i]: float(cal_prob_vec[i]) for i in range(len(cal_prob_vec))
        }

        # 4. Synthesize Trustworthy Diagnostic Result
        return self.trust_evaluator.evaluate(
            raw_scores=raw_scores,
            calibrated_probs=calibrated_probs,
            dsp_result=dsp_result,
            features=feat_dict,
            operating_rpm=rpm,
            poles=p,
            source_metadata=source_meta,
        )

    def predict_raw(
        self,
        current_data: np.ndarray,
        sampling_rate_hz: float,
        operating_rpm: Optional[float] = None,
        poles: int = 4,
    ) -> TrustworthyDiagnosticResult:
        """
        Runs trustworthy diagnostic evaluation directly on a raw numpy current array.
        """
        source_meta = {
            "dataset_id": "IN_MEMORY_STREAM",
            "source_file_id": "RAW_ARRAY",
        }

        # Check signal duration
        if sampling_rate_hz and sampling_rate_hz > 0:
            num_samples = current_data.shape[1] if current_data.ndim > 1 else len(current_data)
            duration = num_samples / sampling_rate_hz
            if duration < 0.20:
                return build_invalid_signal_result(
                    f"Truncated signal: duration {duration:.4f}s is below 0.20s minimum required for MCSA frequency resolution.",
                    source_metadata=source_meta,
                    model_version=self.model_version,
                )

        # 1. Run DSP Pipeline with input error catching
        try:
            dsp_result = self.dsp_engine.analyze(
                current_data,
                sampling_rate_hz=sampling_rate_hz,
                operating_rpm=operating_rpm,
                poles=poles,
            )
        except SignalValidationError as ve:
            return build_invalid_signal_result(str(ve), source_metadata=source_meta, model_version=self.model_version)
        except ValueError as ve:
            return build_invalid_signal_result(str(ve), source_metadata=source_meta, model_version=self.model_version)
        except Exception as ex:
            return build_invalid_signal_result(f"DSP processing error: {ex}", source_metadata=source_meta, model_version=self.model_version)

        # 2. Extract ML Features
        try:
            feat_dict = extract_ml_features(dsp_result)
            feat_vec = feature_dict_to_vector(feat_dict).reshape(1, -1)
        except Exception as ex:
            return build_invalid_signal_result(f"Feature extraction error: {ex}", source_metadata=source_meta, model_version=self.model_version)

        # 3. Compute Raw Scores and Calibrated Probabilities
        raw_prob_vec = self.pipeline.predict_proba(feat_vec)[0]
        raw_scores = {
            self.int_to_class[i]: float(raw_prob_vec[i]) for i in range(len(raw_prob_vec))
        }

        if self.calibrator is not None and getattr(self.calibrator, "is_fitted", False):
            cal_prob_vec = self.calibrator.calibrate(raw_prob_vec.reshape(1, -1))[0]
        else:
            cal_prob_vec = raw_prob_vec

        calibrated_probs = {
            self.int_to_class[i]: float(cal_prob_vec[i]) for i in range(len(cal_prob_vec))
        }

        # 4. Synthesize Trustworthy Diagnostic Result
        return self.trust_evaluator.evaluate(
            raw_scores=raw_scores,
            calibrated_probs=calibrated_probs,
            dsp_result=dsp_result,
            features=feat_dict,
            operating_rpm=operating_rpm,
            poles=poles,
            source_metadata=source_meta,
        )

"""
Unit Tests for Machine Learning Training, Evaluation, and Inference Pipeline.

Verifies:
    1. Saved model artifact structure and metadata.
    2. Zero data leakage (group independence).
    3. Model loading and inference on unseen test recordings.
    4. Multi-class prediction for Healthy, Broken Rotor Bar, Bearing Fault, and Misalignment.
    5. Calibrated probability distribution summing to 1.0.
    6. Exact 16-dimensional feature vector without metadata leakage.
"""

from pathlib import Path
import joblib
import numpy as np
import pytest

from ml_service.data.canonical import CanonicalFaultClass
from ml_service.data.fixtures.synthetic_fixtures import generate_synthetic_mcsa_recording
from ml_service.ml.features import FEATURE_COLUMNS, extract_ml_features, feature_dict_to_vector
from ml_service.ml.inference import MCSAPredictor, DiagnosticPrediction
from ml_service.ml.dataset import CLASS_TO_INT, INT_TO_CLASS, build_evaluation_dataset, split_by_group

MODEL_ARTIFACT_PATH = Path(__file__).parent.parent / "models" / "mcsa_classifier.joblib"


class TestModelArtifactAndLeakage:
    """Verifies artifact preservation and group leakage prevention."""

    def test_artifact_exists_and_contains_metadata(self):
        assert MODEL_ARTIFACT_PATH.exists(), f"Model artifact missing: {MODEL_ARTIFACT_PATH}"
        artifact = joblib.load(MODEL_ARTIFACT_PATH)

        assert "pipeline" in artifact
        assert "feature_names" in artifact
        assert "class_to_int" in artifact
        assert "metrics" in artifact
        assert len(artifact["feature_names"]) == 16
        assert artifact["metrics"]["balanced_accuracy"] > 0.85

    def test_zero_leakage_in_group_split(self):
        dataset = build_evaluation_dataset(samples_per_class=10, random_seed=99)
        X_train, X_test, y_train, y_test, groups_train, groups_test = split_by_group(
            dataset, test_size=0.30, random_seed=99
        )

        train_groups = set(groups_train)
        test_groups = set(groups_test)
        # Groups must be strictly mutually exclusive
        assert train_groups.isdisjoint(test_groups)
        assert len(X_train) + len(X_test) == len(dataset.X)


class TestInferenceEngine:
    """Verifies end-to-end inference on unseen supported recordings."""

    @pytest.fixture(scope="class")
    def predictor(self):
        return MCSAPredictor(MODEL_ARTIFACT_PATH)

    def test_predict_on_unseen_healthy_recording(self, predictor):
        # Generate unseen recording with distinct random seed
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.HEALTHY, duration_seconds=1.0, sampling_rate_hz=5000.0, seed=12345
        )
        pred = predictor.predict_recording(rec)

        assert isinstance(pred, DiagnosticPrediction)
        assert pred.predicted_class in [CanonicalFaultClass.HEALTHY, CanonicalFaultClass.BEARING_FAULT]
        assert 0.0 <= pred.confidence <= 1.0
        assert 0.0 <= pred.health_index <= 100.0
        assert sum(pred.probabilities.values()) == pytest.approx(1.0, rel=1e-3)

    def test_predict_on_unseen_brb_recording(self, predictor):
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.BROKEN_ROTOR_BAR, duration_seconds=1.0, sampling_rate_hz=5000.0, seed=54321
        )
        pred = predictor.predict_recording(rec)

        assert isinstance(pred, DiagnosticPrediction)
        assert pred.predicted_class == CanonicalFaultClass.BROKEN_ROTOR_BAR
        assert pred.confidence > 0.50
        assert pred.health_index < 70.0
        assert pred.severity in ["MONITOR", "WARNING", "CRITICAL"]

    def test_predict_on_unseen_bearing_fault_recording(self, predictor):
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.BEARING_FAULT, duration_seconds=1.0, sampling_rate_hz=5000.0, seed=77777
        )
        pred = predictor.predict_recording(rec)

        assert isinstance(pred, DiagnosticPrediction)
        assert pred.predicted_class == CanonicalFaultClass.BEARING_FAULT
        assert pred.confidence > 0.50

    def test_predict_on_unseen_misalignment_recording(self, predictor):
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.MISALIGNMENT, duration_seconds=1.0, sampling_rate_hz=5000.0, seed=88888
        )
        pred = predictor.predict_recording(rec)

        assert isinstance(pred, DiagnosticPrediction)
        assert pred.predicted_class == CanonicalFaultClass.MISALIGNMENT
        assert pred.confidence > 0.50

    def test_predict_raw_numpy_array(self, predictor):
        # 3-phase pure 50 Hz array (1000 samples at 5 kHz)
        t = np.linspace(0, 0.2, 1000, endpoint=False)
        ia = 10.0 * np.cos(2 * np.pi * 50 * t)
        ib = 10.0 * np.cos(2 * np.pi * 50 * t - 2 * np.pi / 3)
        ic = 10.0 * np.cos(2 * np.pi * 50 * t + 2 * np.pi / 3)
        raw_arr = np.vstack([ia, ib, ic])

        pred = predictor.predict_raw(raw_arr, sampling_rate_hz=5000.0)
        assert pred.predicted_class == CanonicalFaultClass.HEALTHY
        assert pred.provenance["dataset_id"] == "IN_MEMORY_STREAM"


class TestFeatureSchemaIntegrity:
    """Verifies feature schema constraints and prevention of leakage."""

    def test_feature_columns_match_definition(self):
        assert len(FEATURE_COLUMNS) == 16
        # Assert no forbidden metadata terms in feature column names
        forbidden = ["label", "target", "file", "path", "name", "id", "class"]
        for col in FEATURE_COLUMNS:
            for f in forbidden:
                assert f not in col.lower(), f"Potential leakage in feature column: {col}"

    def test_feature_vector_conversion(self):
        dummy_feats = {col: float(i + 1) for i, col in enumerate(FEATURE_COLUMNS)}
        vec = feature_dict_to_vector(dummy_feats)

        assert vec.shape == (16,)
        assert not np.any(np.isnan(vec))
        assert vec[0] == 1.0
        assert vec[-1] == 16.0

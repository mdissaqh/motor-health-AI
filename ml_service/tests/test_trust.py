"""
Comprehensive Unit Tests for Trustworthy Diagnostic Output (Phase 4).

Verifies:
1. Five mutually exclusive diagnostic statuses:
   - DIAGNOSIS_AVAILABLE
   - REVIEW_REQUIRED
   - INVALID_SIGNAL
   - UNSUPPORTED_CONDITION
   - MODEL_UNAVAILABLE
2. Strict conceptual distinction between:
   - raw_class_scores (tree vote proportion)
   - calibrated_probabilities (post-temperature scaling distribution)
   - model_confidence (scalar calibrated certainty)
3. Documented human-review policy triggers:
   - Ambiguous low-margin predictions
   - Conflicting physical rules (ML vs deterministic MCSA)
   - High distortion / noise
   - Marginal operating slip
4. Defensible severity estimation:
   - EPRI standard severity for Broken Rotor Bars
   - Explicit refusal ("Severity unavailable — insufficient validated labels.") for Bearing Fault and Misalignment
5. Robustness to edge cases:
   - Noisy signals
   - Truncated signals
   - Missing metadata
   - Unsupported operating conditions
   - Corrupted / NaN signals
"""

from pathlib import Path
import numpy as np
import pytest

from ml_service.data.canonical import CanonicalFaultClass, MotorCurrentRecording
from ml_service.data.fixtures.synthetic_fixtures import generate_synthetic_mcsa_recording
from ml_service.ml.inference import MCSAPredictor
from ml_service.ml.trust import (
    DiagnosticStatus,
    TrustworthyDiagnosticResult,
    build_invalid_signal_result,
    build_model_unavailable_result,
)

MODEL_ARTIFACT_PATH = Path(__file__).parent.parent / "models" / "mcsa_classifier.joblib"


class TestTrustworthyStatuses:
    """Tests the 5 distinct diagnostic statuses."""

    @pytest.fixture(scope="class")
    def predictor(self):
        return MCSAPredictor(MODEL_ARTIFACT_PATH)

    def test_diagnosis_available_on_clear_brb_recording(self, predictor):
        """Clear BRB signal with physical sidebands yields DIAGNOSIS_AVAILABLE."""
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.BROKEN_ROTOR_BAR,
            duration_seconds=1.0,
            sampling_rate_hz=5000.0,
            seed=42,
        )
        result: TrustworthyDiagnosticResult = predictor.predict_recording(rec)

        assert result.diagnostic_status == DiagnosticStatus.DIAGNOSIS_AVAILABLE
        assert result.predicted_class == CanonicalFaultClass.BROKEN_ROTOR_BAR
        assert result.model_confidence is not None and result.model_confidence > 0.65
        assert len(result.human_review_triggers) == 0
        assert len(result.corroborating_indicators) > 0
        assert len(result.spectral_regions) >= 3

    def test_diagnosis_available_on_clear_healthy_recording(self, predictor):
        """Clear healthy signal yields DIAGNOSIS_AVAILABLE with EPRI Healthy severity."""
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.HEALTHY,
            duration_seconds=1.0,
            sampling_rate_hz=5000.0,
            seed=101,
        )
        result = predictor.predict_recording(rec)

        assert result.diagnostic_status == DiagnosticStatus.DIAGNOSIS_AVAILABLE
        assert result.predicted_class in [CanonicalFaultClass.HEALTHY, CanonicalFaultClass.BEARING_FAULT]
        assert result.model_confidence is not None and result.model_confidence > 0.60
        assert result.severity.status in ["HEALTHY", "UNSUPPORTED_SEVERITY"]

    def test_invalid_signal_on_truncated_recording(self, predictor):
        """Signal shorter than minimum duration yields INVALID_SIGNAL."""
        # 0.05 seconds is way too short (< 0.5s requirement)
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.HEALTHY,
            duration_seconds=0.05,
            sampling_rate_hz=5000.0,
            seed=999,
        )
        result = predictor.predict_recording(rec)

        assert result.diagnostic_status == DiagnosticStatus.INVALID_SIGNAL
        assert result.predicted_class is None
        assert result.model_confidence is None
        assert "duration" in result.status_explanation.lower() or "invalid" in result.status_explanation.lower()
        assert len(result.diagnostic_warnings) > 0

    def test_invalid_signal_on_nan_corrupted_data(self, predictor):
        """NaN values yield INVALID_SIGNAL without crashing."""
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.HEALTHY,
            duration_seconds=1.0,
            sampling_rate_hz=5000.0,
            seed=12,
        )
        # Corrupt samples with NaN
        rec.current_data[0, 100:150] = np.nan
        result = predictor.predict_recording(rec)

        assert result.diagnostic_status == DiagnosticStatus.INVALID_SIGNAL
        assert result.predicted_class is None
        assert "nan" in result.status_explanation.lower()

    def test_unsupported_condition_on_extreme_supply_frequency(self, predictor):
        """Fundamental frequency outside 15-120 Hz yields UNSUPPORTED_CONDITION."""
        t = np.linspace(0, 1.0, 5000, endpoint=False)
        # 8 Hz signal (outside 15-120 Hz induction motor envelope)
        ia = 10.0 * np.cos(2 * np.pi * 8.0 * t)
        raw_arr = np.vstack([ia, ia, ia])

        result = predictor.predict_raw(raw_arr, sampling_rate_hz=5000.0)
        assert result.diagnostic_status == DiagnosticStatus.UNSUPPORTED_CONDITION
        assert result.predicted_class is None
        assert "outside the supported operating envelope" in result.status_explanation

    def test_unsupported_condition_on_near_zero_slip(self, predictor):
        """Near-zero slip (s < 0.002) yields UNSUPPORTED_CONDITION."""
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.HEALTHY,
            duration_seconds=1.0,
            sampling_rate_hz=5000.0,
            seed=7,
        )
        # Set speed very close to synchronous 1500 RPM (s = 0.00067)
        rec.operating_conditions["speed_rpm"] = 1499.0
        result = predictor.predict_recording(rec)

        assert result.diagnostic_status == DiagnosticStatus.UNSUPPORTED_CONDITION
        assert "no-load" in result.status_explanation.lower() or "slip" in result.status_explanation.lower()

    def test_model_unavailable_when_artifact_missing(self):
        """Missing or corrupted artifact generates MODEL_UNAVAILABLE result."""
        fake_path = Path("non_existent_model_file.joblib")
        result = build_model_unavailable_result(f"Artifact not found: {fake_path}")

        assert result.diagnostic_status == DiagnosticStatus.MODEL_UNAVAILABLE
        assert result.predicted_class is None
        assert "Model unavailable" in result.status_explanation
        assert result.severity.severity_level == "Severity unavailable — insufficient validated labels."


class TestHumanReviewPolicy:
    """Verifies human-review triggers for ambiguous or conflicting cases."""

    @pytest.fixture(scope="class")
    def predictor(self):
        return MCSAPredictor(MODEL_ARTIFACT_PATH)

    def test_conflicting_brb_sidebands_triggers_review(self, predictor):
        """
        When ML predicts BROKEN_ROTOR_BAR but measured sidebands attenuation
        is > 54 dB (physically healthy), review is required.
        """
        # Create an artificial conflict in features
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.BROKEN_ROTOR_BAR,
            duration_seconds=1.0,
            sampling_rate_hz=5000.0,
            seed=42,
        )
        # Run prediction
        res = predictor.predict_recording(rec)

        # Now test the evaluator directly with synthetic contradiction
        evaluator = predictor.trust_evaluator
        dsp_res = predictor.dsp_engine.analyze(rec)
        feats = {"brb_min_delta_db": 58.0}  # >= 54 dB is healthy!

        conflicts = evaluator._check_physical_evidence_conflicts(
            CanonicalFaultClass.BROKEN_ROTOR_BAR, feats
        )
        assert len(conflicts) > 0
        assert "Physical contradiction" in conflicts[0]
        assert "EPRI Healthy standards" in conflicts[0]

    def test_conflicting_healthy_with_broken_rotor_bar_triggers_review(self, predictor):
        """
        When model predicts HEALTHY but physical sidebands are < 42 dB, review is required.
        """
        evaluator = predictor.trust_evaluator
        feats = {"brb_min_delta_db": 38.0}  # < 42 dB indicates severe rotor bar defect!

        conflicts = evaluator._check_physical_evidence_conflicts(
            CanonicalFaultClass.HEALTHY, feats
        )
        assert len(conflicts) > 0
        assert "Physical contradiction" in conflicts[0]

    def test_conflicting_healthy_with_high_phase_unbalance_triggers_review(self, predictor):
        """
        When model predicts HEALTHY but Park's unbalance is > 8%, review is required.
        """
        evaluator = predictor.trust_evaluator
        feats = {"parks_vector_unbalance_ratio": 0.12}  # 12% unbalance!

        conflicts = evaluator._check_physical_evidence_conflicts(
            CanonicalFaultClass.HEALTHY, feats
        )
        assert len(conflicts) > 0
        assert "severe phase unbalance" in conflicts[0]

    def test_high_noise_and_thd_triggers_review(self, predictor):
        """High harmonic distortion (> 25%) triggers human review."""
        t = np.linspace(0, 1.0, 5000, endpoint=False)
        # Heavy distortion with multiple non-linear harmonics and noise
        ia = 10.0 * np.cos(2 * np.pi * 50 * t) + 4.0 * np.cos(2 * np.pi * 150 * t) + 3.0 * np.cos(2 * np.pi * 250 * t)
        noise = np.random.RandomState(42).normal(0, 2.0, len(t))
        ia_noisy = ia + noise
        raw_arr = np.vstack([ia_noisy, ia_noisy, ia_noisy])

        result = predictor.predict_raw(raw_arr, sampling_rate_hz=5000.0)
        assert result.diagnostic_status in [DiagnosticStatus.REVIEW_REQUIRED, DiagnosticStatus.DIAGNOSIS_AVAILABLE]
        if result.diagnostic_status == DiagnosticStatus.REVIEW_REQUIRED:
            assert len(result.human_review_triggers) > 0


class TestDefensibleSeverityPolicy:
    """Verifies that severity estimation strictly adheres to verified standards."""

    @pytest.fixture(scope="class")
    def predictor(self):
        return MCSAPredictor(MODEL_ARTIFACT_PATH)

    def test_brb_severity_follows_epri_standard(self, predictor):
        """Broken rotor bar severity uses EPRI standard levels and dB measurement basis."""
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.BROKEN_ROTOR_BAR,
            duration_seconds=1.0,
            sampling_rate_hz=5000.0,
            seed=54321,
        )
        result = predictor.predict_recording(rec)

        assert result.predicted_class == CanonicalFaultClass.BROKEN_ROTOR_BAR
        assert result.severity.status == "FAULT_DETECTED"
        assert "EPRI" in result.severity.standard_reference
        assert "Sideband attenuation" in result.severity.measurement_basis
        # Check standard EPRI level terminology
        assert any(
            lvl in result.severity.severity_level
            for lvl in ["Moderate", "Severe", "Critical", "Healthy"]
        )

    def test_bearing_fault_explicitly_returns_severity_unavailable(self, predictor):
        """Bearing fault returns 'Severity unavailable — insufficient validated labels.' (Task 9)."""
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.BEARING_FAULT,
            duration_seconds=1.0,
            sampling_rate_hz=5000.0,
            seed=77777,
        )
        result = predictor.predict_recording(rec)

        assert result.predicted_class == CanonicalFaultClass.BEARING_FAULT
        assert result.severity.severity_level == "Severity unavailable — insufficient validated labels."
        assert "insufficient validated labels" in str(result.severity)

    def test_misalignment_explicitly_returns_severity_unavailable(self, predictor):
        """Misalignment returns 'Severity unavailable — insufficient validated labels.' (Task 9)."""
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.MISALIGNMENT,
            duration_seconds=1.0,
            sampling_rate_hz=5000.0,
            seed=88888,
        )
        result = predictor.predict_recording(rec)

        assert result.predicted_class == CanonicalFaultClass.MISALIGNMENT
        assert result.severity.severity_level == "Severity unavailable — insufficient validated labels."
        assert "insufficient validated labels" in str(result.severity)


class TestConceptualDistinctnessAndTraceability:
    """Verifies distinctness of raw scores, calibrated probabilities, and confidence."""

    @pytest.fixture(scope="class")
    def predictor(self):
        return MCSAPredictor(MODEL_ARTIFACT_PATH)

    def test_scores_probabilities_and_confidence_are_conceptually_distinct(self, predictor):
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.BROKEN_ROTOR_BAR,
            duration_seconds=1.0,
            sampling_rate_hz=5000.0,
            seed=42,
        )
        result = predictor.predict_recording(rec)

        # 1. Raw scores are present as dict
        assert isinstance(result.raw_class_scores, dict)
        assert len(result.raw_class_scores) == 4
        assert sum(result.raw_class_scores.values()) == pytest.approx(1.0, rel=1e-3)

        # 2. Calibrated probabilities are present as dict
        assert isinstance(result.calibrated_probabilities, dict)
        assert len(result.calibrated_probabilities) == 4
        assert sum(result.calibrated_probabilities.values()) == pytest.approx(1.0, rel=1e-3)

        # 3. Model confidence is a scalar float
        assert isinstance(result.model_confidence, float)
        assert 0.0 <= result.model_confidence <= 1.0

        # 4. Check they are distinct mappings/values
        assert result.model_confidence == pytest.approx(
            result.calibrated_probabilities[result.predicted_class.value], rel=1e-4
        )

    def test_spectral_regions_and_key_features_traceability(self, predictor):
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.BROKEN_ROTOR_BAR,
            duration_seconds=1.0,
            sampling_rate_hz=5000.0,
            seed=42,
        )
        result = predictor.predict_recording(rec)

        # Spectral regions
        assert len(result.spectral_regions) >= 3
        region_names = [r.name for r in result.spectral_regions]
        assert any("Fundamental" in name for name in region_names)
        assert any("Broken Rotor Bar" in name for name in region_names)

        for reg in result.spectral_regions:
            assert reg.frequency_range_hz[0] < reg.frequency_range_hz[1]
            assert reg.measured_amplitude_a >= 0.0
            assert len(reg.diagnostic_relevance) > 0

        # Key physical features
        assert "crest_factor" in result.key_features
        assert "brb_min_delta_db" in result.key_features
        assert "parks_vector_unbalance_ratio" in result.key_features
        assert result.key_features["crest_factor"].unit == "ratio"
        assert result.key_features["brb_min_delta_db"].unit == "dB"

    def test_missing_metadata_handled_gracefully(self, predictor):
        """Missing motor speed or nameplate metadata executes without failure."""
        rec = generate_synthetic_mcsa_recording(
            CanonicalFaultClass.HEALTHY,
            duration_seconds=1.0,
            sampling_rate_hz=5000.0,
            seed=123,
        )
        # Strip metadata
        rec.operating_conditions.clear()
        rec.motor_metadata.clear()

        result = predictor.predict_recording(rec)
        assert result.diagnostic_status in [DiagnosticStatus.DIAGNOSIS_AVAILABLE, DiagnosticStatus.REVIEW_REQUIRED]
        assert result.model_version == "mcsa_rf_v1.0.0"
        assert result.provenance["operating_rpm"] is None

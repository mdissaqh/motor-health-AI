"""
Unit Tests for MCSA Dataset Adapters, Validation, and Fixtures.

Tests:
    1. 4TU NLN-EMP adapter loading and voltage/vibration exclusion.
    2. LIAS MCSA-DC adapter loading and rotor bar classification.
    3. Paderborn adapter loading and bearing defect extraction.
    4. Honest reporting of missing fault classes (dataset gaps).
    5. Input validation and rejection of malformed inputs (NaN, Inf, forbidden sensors).
    6. Synthetic fixture generation and separation flags.
"""

from pathlib import Path
import numpy as np
import pytest

from ml_service.data.canonical import (
    CanonicalFaultClass,
    MotorCurrentRecording,
    validate_recording_fields,
)
from ml_service.data.nln_emp_adapter import NLNEMPAdapter
from ml_service.data.lias_adapter import LIASAdapter
from ml_service.data.paderborn_adapter import PaderbornAdapter
from ml_service.data.fixtures.synthetic_fixtures import generate_synthetic_mcsa_recording

SAMPLES_DIR = Path(__file__).parent.parent / "data" / "samples"


class TestNLNEMPAdapter:
    """Tests for the 4TU Centrifugal Pump NLN-EMP Adapter."""

    def test_load_healthy_sample(self):
        adapter = NLNEMPAdapter()
        file_path = SAMPLES_DIR / "nln_emp_sample_healthy.csv"
        assert file_path.exists(), f"Sample file missing: {file_path}"

        recording = adapter.load_recording(file_path, source_label="healthy")

        assert recording.dataset_id == "4TU_NLN_EMP"
        assert recording.canonical_fault_class == CanonicalFaultClass.HEALTHY
        assert recording.sampling_rate_hz == 20000.0
        # Check that ONLY the 3 current channels were retained (voltages & vibrations discarded)
        assert len(recording.channels) == 3
        assert recording.current_data.shape[0] == 3
        assert recording.current_data.shape[1] == recording.num_samples
        assert recording.is_synthetic is False
        assert recording.current_units == "A"

    def test_load_broken_rotor_bar_sample(self):
        adapter = NLNEMPAdapter()
        file_path = SAMPLES_DIR / "nln_emp_sample_brb.csv"
        recording = adapter.load_recording(file_path, source_label="broken_rotor_bar_1")

        assert recording.canonical_fault_class == CanonicalFaultClass.BROKEN_ROTOR_BAR
        assert recording.severity_label == "1_DRILLED_BAR"
        assert recording.current_data.shape[0] == 3

    def test_label_mappings(self):
        adapter = NLNEMPAdapter()
        assert adapter.map_label("Healthy")[0] == CanonicalFaultClass.HEALTHY
        assert adapter.map_label("broken_rotor_bar_2")[0] == CanonicalFaultClass.BROKEN_ROTOR_BAR
        assert adapter.map_label("bearing_outer_race")[0] == CanonicalFaultClass.BEARING_FAULT
        assert adapter.map_label("misalignment_angular")[0] == CanonicalFaultClass.MISALIGNMENT
        assert adapter.map_label("stator_winding_short")[0] == CanonicalFaultClass.OTHER_FAULT


class TestLIASAdapter:
    """Tests for the LIAS MCSA-DC Adapter."""

    def test_load_ccs0_healthy(self):
        adapter = LIASAdapter()
        file_path = SAMPLES_DIR / "ccs0.csv"
        recording = adapter.load_recording(file_path)

        assert recording.dataset_id == "LIAS_MCSA_DC"
        assert recording.canonical_fault_class == CanonicalFaultClass.HEALTHY
        # Sampling rate derived from Time column (dt = 0.0001s -> 10000 Hz)
        assert abs(recording.sampling_rate_hz - 10000.0) < 1.0
        # Extracted 3 current channels; voltages, speed, and position discarded
        assert len(recording.channels) == 3
        assert recording.current_data.shape[0] == 3
        assert recording.is_synthetic is False

    def test_load_ccs60_broken_rotor_bar(self):
        adapter = LIASAdapter()
        file_path = SAMPLES_DIR / "ccs60.csv"
        recording = adapter.load_recording(file_path)

        assert recording.canonical_fault_class == CanonicalFaultClass.BROKEN_ROTOR_BAR
        assert recording.severity_label == "1_DRILLED_BAR"

    def test_honest_gap_reporting(self):
        adapter = LIASAdapter()
        # Querying bearing or misalignment on LIAS must raise ValueError explaining the gap
        with pytest.raises(ValueError, match="does not contain bearing fault recordings"):
            adapter.map_label("bearing_damage")

        with pytest.raises(ValueError, match="does not contain misalignment recordings"):
            adapter.map_label("misalignment_test")


class TestPaderbornAdapter:
    """Tests for the Paderborn Bearing Dataset Adapter."""

    def test_load_k001_healthy(self):
        adapter = PaderbornAdapter()
        file_path = SAMPLES_DIR / "paderborn_sample_k001.csv"
        recording = adapter.load_recording(file_path, source_label="k001")

        assert recording.dataset_id == "PADERBORN_BEARING"
        assert recording.canonical_fault_class == CanonicalFaultClass.HEALTHY
        assert recording.sampling_rate_hz == 64000.0
        # Only 2 LEM phase current channels retained; vibration discarded
        assert len(recording.channels) == 2
        assert recording.current_data.shape[0] == 2

    def test_load_ka01_outer_ring_defect(self):
        adapter = PaderbornAdapter()
        file_path = SAMPLES_DIR / "paderborn_sample_ka01.csv"
        recording = adapter.load_recording(file_path, source_label="ka01")

        assert recording.canonical_fault_class == CanonicalFaultClass.BEARING_FAULT
        assert recording.severity_label == "OUTER_RING_EDM_LEVEL_1"

    def test_honest_gap_reporting(self):
        adapter = PaderbornAdapter()
        # PMSM motors have no rotor bars; querying BRB must raise a physical gap error
        with pytest.raises(ValueError, match="PMSM rotors have permanent magnets and no rotor bars"):
            adapter.map_label("broken_rotor_bar")

        with pytest.raises(ValueError, match="does not include shaft misalignment"):
            adapter.map_label("misalignment_angular")


class TestInputValidation:
    """Tests for input validation and malformed input rejection."""

    def test_reject_invalid_sampling_rate(self):
        data = np.ones((1, 500))
        with pytest.raises(ValueError, match="Invalid sampling rate"):
            validate_recording_fields(0.0, data, ["current_phase_a"], 500)

        with pytest.raises(ValueError, match="Invalid sampling rate"):
            validate_recording_fields(-100.0, data, ["current_phase_a"], 500)

    def test_reject_insufficient_samples(self):
        data = np.ones((1, 50))  # Less than 100
        with pytest.raises(ValueError, match="Insufficient samples"):
            validate_recording_fields(1000.0, data, ["current_phase_a"], 50)

    def test_reject_nan_values(self):
        data = np.ones((1, 500))
        data[0, 100] = np.nan
        with pytest.raises(ValueError, match="contains NaN values"):
            validate_recording_fields(1000.0, data, ["current_phase_a"], 500)

    def test_reject_inf_values(self):
        data = np.ones((1, 500))
        data[0, 200] = np.inf
        with pytest.raises(ValueError, match="contains infinite"):
            validate_recording_fields(1000.0, data, ["current_phase_a"], 500)

    def test_reject_forbidden_sensor_channels(self):
        data = np.ones((1, 500))
        with pytest.raises(ValueError, match="Forbidden sensor type detected"):
            validate_recording_fields(1000.0, data, ["vibration_accelerometer_x"], 500)

        with pytest.raises(ValueError, match="Forbidden sensor type detected"):
            validate_recording_fields(1000.0, data, ["stator_voltage_phase_a"], 500)


class TestSyntheticFixtures:
    """Tests for deterministic synthetic physics fixtures."""

    @pytest.mark.parametrize(
        "fault_class",
        [
            CanonicalFaultClass.HEALTHY,
            CanonicalFaultClass.BROKEN_ROTOR_BAR,
            CanonicalFaultClass.BEARING_FAULT,
            CanonicalFaultClass.MISALIGNMENT,
        ],
    )
    def test_synthetic_fixture_generation(self, fault_class):
        rec = generate_synthetic_mcsa_recording(fault_class, duration_seconds=1.0, sampling_rate_hz=5000.0)

        assert rec.is_synthetic is True
        assert rec.dataset_id == "SYNTHETIC_FIXTURE_NOT_RESEARCH_DATA"
        assert rec.canonical_fault_class == fault_class
        assert rec.current_data.shape == (3, 5000)
        assert not np.any(np.isnan(rec.current_data))
        assert "NOT EMPIRICAL EXPERIMENTAL DATA" in rec.notes

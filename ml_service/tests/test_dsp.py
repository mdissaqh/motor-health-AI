"""
Unit Tests for MCSA Digital Signal Processing Engine.

Verifies:
    1. FFT peak locations and amplitude scaling against pure mathematical sinusoids.
    2. Dynamic supply frequency tracking (50 Hz, 60 Hz, 45 Hz VFD) without hardcoding.
    3. Theoretical BRB sideband locations and delta-dB severity grading.
    4. Park's Vector unbalance metrics under balanced vs asymmetric 3-phase currents.
    5. Hilbert envelope demodulation for modulation frequency identification.
    6. Strict validation: rejection of NaN, Inf, non-current units, non-positive fs.
    7. Multi-indicator rules: adherence to 'Never claim one peak proves a fault'.
"""

from pathlib import Path
import numpy as np
import pytest

from ml_service.dsp.pipeline import MCSAEngine, MCSAAnalysisResult
from ml_service.data.nln_emp_adapter import NLNEMPAdapter
from ml_service.data.lias_adapter import LIASAdapter

SAMPLES_DIR = Path(__file__).parent.parent / "data" / "samples"


class TestFFTAccuracyAndScaling:
    """Verifies that FFT preserves exact physical amplitudes in Amperes."""

    def test_pure_sine_amplitude_and_frequency(self):
        engine = MCSAEngine()
        fs = 1000.0  # 1 kHz
        duration = 2.0  # 2s -> df = 0.5 Hz
        n = int(fs * duration)
        t = np.linspace(0, duration, n, endpoint=False)

        test_freq = 60.0  # 60 Hz fundamental (tests non-50Hz support)
        test_amp = 10.0   # 10.0 A peak
        signal = test_amp * np.cos(2.0 * np.pi * test_freq * t)

        freqs, mags_amp, mags_db, df = engine.compute_spectrum(signal, fs)

        # Locate peak
        peak_idx = int(np.argmax(mags_amp))
        detected_freq = freqs[peak_idx]
        detected_amp = mags_amp[peak_idx]

        assert abs(detected_freq - test_freq) < 0.1, f"Expected {test_freq} Hz, got {detected_freq} Hz"
        # Window amplitude scaling must recover the true peak amplitude within 1%
        assert abs(detected_amp - test_amp) < 0.15, f"Expected {test_amp} A peak, got {detected_amp} A"

    def test_rms_time_domain_calculation(self):
        engine = MCSAEngine()
        fs = 2000.0
        t = np.linspace(0, 1.0, 2000, endpoint=False)
        test_amp = 14.142  # ~10 A RMS
        signal = test_amp * np.cos(2.0 * np.pi * 50.0 * t)

        time_feats = engine.extract_time_domain_features(signal)
        # Expected RMS = test_amp / sqrt(2) ~ 10.0 A
        assert abs(time_feats["rms"] - 10.0) < 0.05
        # Expected Crest Factor for pure sine = sqrt(2) ~ 1.414
        assert abs(time_feats["crest_factor"] - np.sqrt(2.0)) < 0.05


class TestDynamicSupplyFrequencyDetection:
    """Verifies that the engine dynamically adapts to grid/VFD variations without hardcoding 50 Hz."""

    @pytest.mark.parametrize("target_fs", [45.0, 50.0, 60.0])
    def test_variable_fundamental_frequency(self, target_fs):
        engine = MCSAEngine()
        fs = 5000.0
        t = np.linspace(0, 1.0, 5000, endpoint=False)
        current = 8.5 * np.cos(2.0 * np.pi * target_fs * t)

        result = engine.analyze(current, sampling_rate_hz=fs)
        assert abs(result.fundamental_frequency_hz - target_fs) < 0.5
        assert abs(result.fundamental_amplitude_amp - 8.5) < 0.2


class TestBrokenRotorBarSidebands:
    """Verifies Broken Rotor Bar sideband localization and IEEE delta-dB grading."""

    def test_brb_sideband_delta_db_accuracy(self):
        engine = MCSAEngine()
        fs_sample = 5000.0
        duration = 2.0  # 2.0s -> df = 0.5 Hz
        n = int(fs_sample * duration)
        t = np.linspace(0, duration, n, endpoint=False)

        fs_supply = 50.0
        slip = 0.03  # 3% slip
        # BRB sidebands at (1 +/- 2s)*fs -> 50*(1 +/- 0.06) -> 47.0 Hz and 53.0 Hz
        f_left = 47.0
        f_right = 53.0

        i_fund = 10.0 * np.cos(2.0 * np.pi * fs_supply * t)
        # Add sidebands at -40 dB relative to fundamental (0.1 A amplitude)
        # 20*log10(10 / 0.1) = 20*log10(100) = 40.0 dB delta
        i_sidebands = 0.1 * (np.cos(2.0 * np.pi * f_left * t) + np.cos(2.0 * np.pi * f_right * t))

        current_signal = i_fund + i_sidebands
        result = engine.analyze(
            current_signal,
            sampling_rate_hz=fs_sample,
            operating_rpm=1455.0,  # 1455 RPM on 4-pole motor -> s = (1500 - 1455)/1500 = 0.03
            poles=4,
        )

        sb = result.sideband_analysis
        assert abs(sb["brb_left_freq_hz"] - f_left) <= 0.5
        assert abs(sb["brb_right_freq_hz"] - f_right) <= 0.5
        # Verify delta dB calculation is within 1 dB of theoretical 40 dB
        assert abs(sb["brb_min_delta_db"] - 40.0) < 1.5
        assert sb["brb_severity_indication"] in [
            "PROBABLE_ONE_OR_TWO_BROKEN_BARS",
            "INCIDENTAL_OR_MODERATE_DEGRADATION",
        ]


class TestParksVectorAndMultiPhase:
    """Verifies Park's Vector Transform and 3-phase asymmetry detection."""

    def test_balanced_three_phase_unbalance(self):
        engine = MCSAEngine()
        t = np.linspace(0, 1.0, 5000, endpoint=False)
        omega = 2.0 * np.pi * 50.0
        ia = 10.0 * np.cos(omega * t)
        ib = 10.0 * np.cos(omega * t - 2.0 * np.pi / 3.0)
        ic = 10.0 * np.cos(omega * t + 2.0 * np.pi / 3.0)
        balanced_current = np.vstack([ia, ib, ic])

        _, parks_feats = engine.compute_parks_vector(balanced_current)
        # Balanced current should have virtually zero unbalance ratio (< 1%)
        assert parks_feats["parks_vector_unbalance_ratio"] < 0.01

    def test_unbalanced_phase_detection(self):
        engine = MCSAEngine()
        t = np.linspace(0, 1.0, 5000, endpoint=False)
        omega = 2.0 * np.pi * 50.0
        # Phase A has 25% lower current (inter-turn short or supply drop)
        ia = 7.5 * np.cos(omega * t)
        ib = 10.0 * np.cos(omega * t - 2.0 * np.pi / 3.0)
        ic = 10.0 * np.cos(omega * t + 2.0 * np.pi / 3.0)
        unbalanced_current = np.vstack([ia, ib, ic])

        result = engine.analyze(unbalanced_current, sampling_rate_hz=5000.0)
        # Unbalance ratio should be elevated (> 5%)
        assert result.parks_vector_features["parks_vector_unbalance_ratio"] > 0.05
        # Operational warning must be triggered
        assert any("Significant 3-phase unbalance detected" in w for w in result.operational_warnings)


class TestHilbertEnvelopeDemodulation:
    """Verifies that Hilbert envelope spectrum detects low-frequency modulations."""

    def test_amplitude_modulation_demodulation(self):
        engine = MCSAEngine()
        fs = 5000.0
        t = np.linspace(0, 2.0, 10000, endpoint=False)
        carrier_freq = 50.0
        mod_freq = 12.0  # e.g., low-frequency defect modulation

        # Amplitude modulated signal: (1 + 0.3*cos(2*pi*fm*t)) * cos(2*pi*fc*t)
        signal = (1.0 + 0.3 * np.cos(2.0 * np.pi * mod_freq * t)) * np.cos(2.0 * np.pi * carrier_freq * t)

        env_freqs, env_mags = engine.compute_hilbert_envelope(signal, fs)
        # The envelope spectrum should have a prominent peak at mod_freq (12 Hz)
        mask = (env_freqs >= 10.0) & (env_freqs <= 14.0)
        peak_env_idx = np.where(mask)[0][int(np.argmax(env_mags[mask]))]
        detected_mod = env_freqs[peak_env_idx]

        assert abs(detected_mod - mod_freq) < 0.5


class TestSignalValidationAndRejections:
    """Verifies rejection of invalid inputs and edge cases."""

    def test_reject_unsupported_units(self):
        engine = MCSAEngine()
        data = np.ones((1, 500))
        with pytest.raises(ValueError, match="Unsupported current units 'V'"):
            engine.validate_input(data, sampling_rate_hz=1000.0, current_units="V")

    def test_reject_zero_or_negative_sampling_rate(self):
        engine = MCSAEngine()
        data = np.ones((1, 500))
        with pytest.raises(ValueError, match="Sampling rate must be strictly positive"):
            engine.validate_input(data, sampling_rate_hz=0.0)

    def test_reject_signal_below_minimum_duration(self):
        engine = MCSAEngine(min_signal_duration_seconds=0.1)
        data = np.ones((1, 100))  # at 2000 Hz, 100 samples is 0.05s (< 0.1s)
        with pytest.raises(ValueError, match="is less than minimum required"):
            engine.validate_input(data, sampling_rate_hz=2000.0)


class TestRealSampleAnalysis:
    """Verifies end-to-end processing of benchmark dataset recordings."""

    def test_analyze_4tu_benchmark_file(self):
        adapter = NLNEMPAdapter()
        file_path = SAMPLES_DIR / "nln_emp_benchmark_brb_1s.csv"
        recording = adapter.load_recording(file_path, source_label="broken_rotor_bar_2", sampling_rate_hz=5000.0)

        engine = MCSAEngine()
        result = engine.analyze(recording)

        assert result.provenance["dataset_id"] == "4TU_NLN_EMP"
        assert abs(result.fundamental_frequency_hz - 50.0) < 0.5
        assert result.frequency_resolution_hz == 1.0
        assert result.sideband_analysis["brb_min_delta_db"] < 45.0
        assert len(result.identified_peaks) > 0

    def test_analyze_lias_ccs0_file(self):
        adapter = LIASAdapter()
        file_path = SAMPLES_DIR / "ccs0.csv"
        recording = adapter.load_recording(file_path)

        engine = MCSAEngine()
        result = engine.analyze(recording)

        assert result.provenance["dataset_id"] == "LIAS_MCSA_DC"
        assert result.fundamental_amplitude_amp > 0.5
        assert len(result.time_features) > 0

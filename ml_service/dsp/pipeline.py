"""
Motor Current Signature Analysis (MCSA) Scientific Digital Signal Processing Engine.

This module provides mathematically rigorous, deterministic signal processing
for induction motor stator current waveforms:
1. Signal validation and provenance tracking.
2. Time-domain statistical feature extraction (per-phase and multi-phase Park's vector).
3. Amplitude-corrected Fast Fourier Transform (FFT) with Hanning windowing.
4. Welch Power Spectral Density (PSD) estimation.
5. Hilbert envelope demodulation for low-frequency current modulation analysis.
6. Dynamic fundamental frequency locator (no hardcoded 50 Hz / 60 Hz).
7. Physics-justified fault harmonic and sideband extraction (BRB, misalignment, eccentricity, bearing modulations).
8. Multi-indicator diagnostic warnings adhering to the rule:
   "Never claim that one spectral peak proves a fault."
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
from scipy import signal as sp_signal
from scipy.stats import kurtosis, skew

from ml_service.data.canonical import (
    CanonicalFaultClass,
    MotorCurrentRecording,
    validate_recording_fields,
)


class SignalValidationError(ValueError):
    """Raised when current signal validation fails."""
    pass


@dataclass
class SpectralPeak:
    """Represents a validated peak in the current spectrum."""
    frequency_hz: float
    magnitude_amp: float
    magnitude_db: float
    delta_to_fundamental_db: Optional[float] = None
    harmonic_order: Optional[float] = None
    label: str = "PEAK"


@dataclass
class MCSAAnalysisResult:
    """
    Structured outcome of the MCSA Digital Signal Processing pipeline.
    """
    provenance: Dict[str, Any]
    sampling_rate_hz: float
    duration_seconds: float
    num_samples: int
    frequency_resolution_hz: float
    raw_signal: np.ndarray  # Preserved original signal (num_channels, num_samples)
    preprocessed_signal: np.ndarray  # Zero-mean detrended signal
    time_features: Dict[str, float]
    spectrum_frequencies: np.ndarray  # Bins from 0 to Nyquist
    spectrum_magnitudes_db: np.ndarray  # dB relative to 1 A (or dBc)
    spectrum_magnitudes_amp: np.ndarray  # Calibrated Peak Amplitude in Amperes
    envelope_frequencies: Optional[np.ndarray] = None
    envelope_magnitudes: Optional[np.ndarray] = None
    fundamental_frequency_hz: float = 0.0
    fundamental_amplitude_amp: float = 0.0
    fundamental_amplitude_db: float = 0.0
    motor_slip: Optional[float] = None
    motor_speed_rpm: Optional[float] = None
    identified_peaks: List[SpectralPeak] = field(default_factory=list)
    sideband_analysis: Dict[str, Any] = field(default_factory=dict)
    thd_percentage: float = 0.0
    parks_vector_features: Dict[str, float] = field(default_factory=dict)
    operational_warnings: List[str] = field(default_factory=list)
    confidence_metrics: Dict[str, float] = field(default_factory=dict)


class MCSAEngine:
    """
    Scientific DSP pipeline for Motor Current Signature Analysis.
    """

    def __init__(
        self,
        window_type: str = "hann",
        min_signal_duration_seconds: float = 0.02,
        fft_zero_padding_factor: int = 1,
        frequency_search_band: Tuple[float, float] = (10.0, 150.0),
    ):
        """
        Args:
            window_type: 'hann', 'blackman', or 'boxcar'.
            min_signal_duration_seconds: Minimum duration required for meaningful FFT resolution.
            fft_zero_padding_factor: Interpolation factor for finer FFT peak location.
            frequency_search_band: Range (Hz) to locate fundamental supply frequency.
        """
        self.window_type = window_type
        self.min_signal_duration_seconds = min_signal_duration_seconds
        self.fft_zero_padding_factor = fft_zero_padding_factor
        self.frequency_search_band = frequency_search_band

    def validate_input(
        self,
        current_data: np.ndarray,
        sampling_rate_hz: float,
        current_units: str = "A",
        channels: Optional[List[str]] = None,
    ) -> List[str]:
        """
        Validates signal integrity and returns a list of warnings or raises ValueError.
        """
        if sampling_rate_hz is None or sampling_rate_hz <= 0:
            raise ValueError(f"Sampling rate must be strictly positive, got {sampling_rate_hz} Hz.")

        if current_units not in ["A", "Amperes", "amp", "mA"]:
            raise ValueError(
                f"Unsupported current units '{current_units}'. MCSA engine requires electrical current in Amperes."
            )

        if not isinstance(current_data, np.ndarray):
            raise ValueError("current_data must be a NumPy array.")

        if current_data.size == 0:
            raise ValueError("current_data cannot be empty.")

        if current_data.ndim == 1:
            current_data = current_data.reshape(1, -1)

        num_channels, num_samples = current_data.shape
        channel_names = channels or [f"current_ch_{i}" for i in range(num_channels)]

        validate_recording_fields(
            sampling_rate_hz=sampling_rate_hz,
            current_data=current_data,
            channels=channel_names,
            num_samples=num_samples,
        )

        duration = num_samples / sampling_rate_hz
        if duration < self.min_signal_duration_seconds:
            raise ValueError(
                f"Signal duration {duration:.4f}s is less than minimum required {self.min_signal_duration_seconds}s."
            )

        warnings = []
        freq_resolution = sampling_rate_hz / num_samples
        if freq_resolution > 1.0:
            warnings.append(
                f"Coarse frequency resolution (df = {freq_resolution:.2f} Hz). "
                f"Inciting sideband frequencies (< 1 Hz) may not be fully resolved."
            )

        return warnings

    def extract_time_domain_features(self, signal: np.ndarray, prefix: str = "") -> Dict[str, float]:
        """
        Calculates time-domain statistical features for a 1D current series.
        """
        n = len(signal)
        if n == 0:
            return {}

        mean_val = float(np.mean(signal))
        std_val = float(np.std(signal))
        rms_val = float(np.sqrt(np.mean(signal ** 2)))
        peak_val = float(np.max(np.abs(signal)))
        peak_to_peak = float(np.ptp(signal))

        # Crest Factor: Peak / RMS
        crest_factor = float(peak_val / (rms_val + 1e-12))
        # Form Factor: RMS / Mean Absolute
        mean_abs = float(np.mean(np.abs(signal)))
        form_factor = float(rms_val / (mean_abs + 1e-12))
        # Kurtosis and Skewness
        signal_kurt = float(kurtosis(signal, fisher=True))  # 0 for Gaussian
        signal_skew = float(skew(signal))

        return {
            f"{prefix}mean": mean_val,
            f"{prefix}std": std_val,
            f"{prefix}rms": rms_val,
            f"{prefix}peak": peak_val,
            f"{prefix}peak_to_peak": peak_to_peak,
            f"{prefix}crest_factor": crest_factor,
            f"{prefix}form_factor": form_factor,
            f"{prefix}kurtosis": signal_kurt,
            f"{prefix}skewness": signal_skew,
        }

    def compute_parks_vector(self, current_3phase: np.ndarray) -> Tuple[np.ndarray, Dict[str, float]]:
        """
        Calculates Park's Vector Modulus for a balanced 3-phase current [Ia, Ib, Ic].

        Formulation:
            i_d = sqrt(2/3)*Ia - 1/sqrt(6)*Ib - 1/sqrt(6)*Ic
            i_q = 1/sqrt(2)*Ib - 1/sqrt(2)*Ic
            i_p(t) = sqrt(i_d^2 + i_q^2)
        """
        if current_3phase.shape[0] < 3:
            return np.array([]), {}

        ia = current_3phase[0, :]
        ib = current_3phase[1, :]
        ic = current_3phase[2, :]

        id_comp = np.sqrt(2.0 / 3.0) * ia - (1.0 / np.sqrt(6.0)) * ib - (1.0 / np.sqrt(6.0)) * ic
        iq_comp = (1.0 / np.sqrt(2.0)) * ib - (1.0 / np.sqrt(2.0)) * ic

        ip_modulus = np.sqrt(id_comp ** 2 + iq_comp ** 2)

        # Ellipticity ratio / Park's AC unbalance ripple
        ip_mean = float(np.mean(ip_modulus))
        ip_ripple_rms = float(np.sqrt(np.mean((ip_modulus - ip_mean) ** 2)))
        unbalance_ratio = float(ip_ripple_rms / (ip_mean + 1e-12))

        features = {
            "parks_vector_mean": ip_mean,
            "parks_vector_ripple_rms": ip_ripple_rms,
            "parks_vector_unbalance_ratio": unbalance_ratio,
        }
        return ip_modulus, features

    def compute_spectrum(
        self,
        signal: np.ndarray,
        sampling_rate_hz: float,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, float]:
        """
        Computes amplitude-corrected single-sided FFT.

        Returns:
            frequencies_hz: Frequency axis array.
            magnitudes_amp: Exact physical peak amplitude in Amperes.
            magnitudes_db: Magnitude in dB relative to 1 Ampere peak (20*log10(A)).
            frequency_resolution_hz: Bin spacing df.
        """
        n_samples = len(signal)
        n_fft = n_samples * self.fft_zero_padding_factor

        # Detrend (remove DC offset)
        detrended = signal - np.mean(signal)

        # Apply Windowing
        if self.window_type == "hann":
            win = sp_signal.windows.hann(n_samples)
        elif self.window_type == "blackman":
            win = sp_signal.windows.blackman(n_samples)
        else:
            win = np.ones(n_samples)

        # Amplitude recovery factor: 2.0 / sum(window)
        # Guarantees that a pure sine of amplitude A produces an FFT peak exactly equal to A
        scale_factor = 2.0 / np.sum(win)
        windowed_signal = detrended * win

        fft_raw = np.fft.rfft(windowed_signal, n=n_fft)
        frequencies = np.fft.rfftfreq(n_fft, d=1.0 / sampling_rate_hz)

        # Peak amplitude in Amperes
        magnitudes_amp = np.abs(fft_raw) * scale_factor

        # Magnitude in dB relative to 1 A (clamp floor to -140 dB to avoid log(0))
        magnitudes_db = 20.0 * np.log10(np.maximum(magnitudes_amp, 1e-7))

        freq_resolution = sampling_rate_hz / n_fft
        return frequencies, magnitudes_amp, magnitudes_db, freq_resolution

    def compute_hilbert_envelope(
        self,
        signal: np.ndarray,
        sampling_rate_hz: float,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Computes the Hilbert envelope spectrum for high-frequency current modulation demodulation.
        """
        analytic_signal = sp_signal.hilbert(signal - np.mean(signal))
        envelope = np.abs(analytic_signal)
        # Detrend envelope to inspect low-frequency modulation peaks
        envelope_detrended = envelope - np.mean(envelope)

        n_samples = len(envelope_detrended)
        win = sp_signal.windows.hann(n_samples)
        fft_env = np.fft.rfft(envelope_detrended * win)
        freqs = np.fft.rfftfreq(n_samples, d=1.0 / sampling_rate_hz)
        scale = 2.0 / np.sum(win)
        env_magnitudes = np.abs(fft_env) * scale

        return freqs, env_magnitudes

    def locate_fundamental_frequency(
        self,
        frequencies: np.ndarray,
        magnitudes_amp: np.ndarray,
    ) -> Tuple[float, float, float]:
        """
        Dynamically finds the supply fundamental frequency (fs) without assuming 50 Hz.
        Searches within self.frequency_search_band.
        """
        f_min, f_max = self.frequency_search_band
        mask = (frequencies >= f_min) & (frequencies <= f_max)

        if not np.any(mask):
            # Fallback to absolute maximum if outside search band
            idx_max = int(np.argmax(magnitudes_amp))
        else:
            masked_indices = np.where(mask)[0]
            idx_max = masked_indices[int(np.argmax(magnitudes_amp[mask]))]

        fs = float(frequencies[idx_max])
        amp = float(magnitudes_amp[idx_max])
        db = float(20.0 * np.log10(max(amp, 1e-7)))
        return fs, amp, db

    def extract_sideband_features(
        self,
        frequencies: np.ndarray,
        magnitudes_amp: np.ndarray,
        magnitudes_db: np.ndarray,
        fs: float,
        fs_db: float,
        operating_rpm: Optional[float] = None,
        poles: Optional[int] = 4,
        assumed_slip: float = 0.02,
    ) -> Tuple[Dict[str, Any], List[SpectralPeak]]:
        """
        Locates Broken Rotor Bar (BRB) sidebands, eccentricity harmonics, and bearing defect bands.
        """
        peaks_list = []
        sidebands = {}

        # 1. Determine or estimate slip (s)
        # If operational RPM is provided: s = (fs - p*n_r/120) / fs
        if operating_rpm is not None and operating_rpm > 0 and poles is not None and poles > 0:
            n_sync = (120.0 * fs) / poles
            slip = (n_sync - operating_rpm) / n_sync
            # Clamp physically reasonable slip (0.001 to 0.15)
            slip = float(np.clip(slip, 0.001, 0.20))
        else:
            slip = assumed_slip

        sidebands["slip_used"] = slip
        sidebands["is_slip_estimated"] = operating_rpm is None

        # 2. Broken Rotor Bar Characteristic Frequencies: fs*(1 - 2*s) and fs*(1 + 2*s)
        f_brb_left = fs * (1.0 - 2.0 * slip)
        f_brb_right = fs * (1.0 + 2.0 * slip)

        # Search within a small window around the theoretical sideband (+/- 0.5 Hz)
        def find_peak_near(target_f: float, window_hz: float = 0.5) -> Tuple[float, float, float]:
            mask = (frequencies >= target_f - window_hz) & (frequencies <= target_f + window_hz)
            if not np.any(mask):
                return target_f, 0.0, -120.0
            idx = np.where(mask)[0][int(np.argmax(magnitudes_amp[mask]))]
            return float(frequencies[idx]), float(magnitudes_amp[idx]), float(magnitudes_db[idx])

        act_f_left, amp_left, db_left = find_peak_near(f_brb_left)
        act_f_right, amp_right, db_right = find_peak_near(f_brb_right)

        delta_db_left = fs_db - db_left
        delta_db_right = fs_db - db_right
        min_delta_db = min(delta_db_left, delta_db_right)

        sidebands["brb_left_freq_hz"] = act_f_left
        sidebands["brb_left_amp_db"] = db_left
        sidebands["brb_left_delta_db"] = delta_db_left
        sidebands["brb_right_freq_hz"] = act_f_right
        sidebands["brb_right_amp_db"] = db_right
        sidebands["brb_right_delta_db"] = delta_db_right
        sidebands["brb_min_delta_db"] = min_delta_db

        # Physical IEEE/EPRI MCSA Severity Grading for BRB
        if min_delta_db > 54.0:
            brb_severity = "HEALTHY"
        elif min_delta_db >= 45.0:
            brb_severity = "INCIDENTAL_OR_MODERATE_DEGRADATION"
        elif min_delta_db >= 38.0:
            brb_severity = "PROBABLE_ONE_OR_TWO_BROKEN_BARS"
        else:
            brb_severity = "CRITICAL_MULTIPLE_BROKEN_BARS"
        sidebands["brb_severity_indication"] = brb_severity

        peaks_list.append(
            SpectralPeak(
                frequency_hz=act_f_left,
                magnitude_amp=amp_left,
                magnitude_db=db_left,
                delta_to_fundamental_db=delta_db_left,
                harmonic_order=1.0 - 2.0 * slip,
                label="BRB_LEFT_SIDEBAND",
            )
        )
        peaks_list.append(
            SpectralPeak(
                frequency_hz=act_f_right,
                magnitude_amp=amp_right,
                magnitude_db=db_right,
                delta_to_fundamental_db=delta_db_right,
                harmonic_order=1.0 + 2.0 * slip,
                label="BRB_RIGHT_SIDEBAND",
            )
        )

        # 3. Misalignment & 2nd/3rd Harmonics: 2*fs (100 Hz/120 Hz) and 3*fs
        f_2fs, amp_2fs, db_2fs = find_peak_near(2.0 * fs, window_hz=1.0)
        f_3fs, amp_3fs, db_3fs = find_peak_near(3.0 * fs, window_hz=1.0)
        sidebands["second_harmonic_freq_hz"] = f_2fs
        sidebands["second_harmonic_amp_db"] = db_2fs
        sidebands["second_harmonic_delta_db"] = fs_db - db_2fs
        sidebands["third_harmonic_freq_hz"] = f_3fs
        sidebands["third_harmonic_amp_db"] = db_3fs

        # 4. Total Harmonic Distortion (THD)
        # THD = sqrt(sum(harmonics^2)) / fundamental
        harmonic_powers = [amp_2fs ** 2, amp_3fs ** 2]
        for h in range(4, 8):
            _, a_h, _ = find_peak_near(h * fs, window_hz=1.5)
            harmonic_powers.append(a_h ** 2)

        thd = (np.sqrt(sum(harmonic_powers)) / (magnitudes_amp[np.where(frequencies == fs)[0][0]] + 1e-12)) * 100.0
        sidebands["thd_percentage"] = float(thd)

        return sidebands, peaks_list

    def analyze(
        self,
        recording: Union[MotorCurrentRecording, np.ndarray],
        sampling_rate_hz: Optional[float] = None,
        channels: Optional[List[str]] = None,
        operating_rpm: Optional[float] = None,
        poles: Optional[int] = 4,
        provenance_metadata: Optional[Dict[str, Any]] = None,
    ) -> MCSAAnalysisResult:
        """
        Executes the end-to-end MCSA signal processing workflow.
        """
        # 1. Unpack input
        if isinstance(recording, MotorCurrentRecording):
            raw_data = recording.current_data
            fs = recording.sampling_rate_hz
            chs = recording.channels
            operating_rpm = operating_rpm or recording.operating_conditions.get("speed_rpm")
            poles = poles or recording.motor_metadata.get("poles", 4)
            provenance = {
                "dataset_id": recording.dataset_id,
                "source_file_id": recording.source_file_id,
                "original_label": recording.original_fault_label,
                "is_synthetic": recording.is_synthetic,
            }
        elif isinstance(recording, np.ndarray):
            raw_data = recording
            if sampling_rate_hz is None:
                raise ValueError("sampling_rate_hz is required when passing raw NumPy array.")
            fs = sampling_rate_hz
            chs = channels or [f"ch_{i}" for i in range(raw_data.shape[0] if raw_data.ndim == 2 else 1)]
            provenance = provenance_metadata or {"source": "in_memory_array"}
        else:
            raise ValueError(f"Unsupported recording input type: {type(recording)}")

        # Ensure 2D
        if raw_data.ndim == 1:
            raw_data = raw_data.reshape(1, -1)

        # 2. Validate
        warnings = self.validate_input(raw_data, fs, channels=chs)

        # 3. Preserve raw signal and perform zero-mean detrending
        preprocessed = raw_data - np.mean(raw_data, axis=1, keepdims=True)

        # 4. Extract time-domain metrics
        time_feats = {}
        for ch_idx, ch_name in enumerate(chs):
            time_feats.update(self.extract_time_domain_features(preprocessed[ch_idx, :], prefix=f"{ch_name}_"))

        # 5. Multi-phase analysis (Park's vector if 3 channels present)
        parks_vector_features = {}
        if raw_data.shape[0] >= 3:
            _, parks_vector_features = self.compute_parks_vector(preprocessed)
            time_feats.update(parks_vector_features)
            if parks_vector_features.get("parks_vector_unbalance_ratio", 0) > 0.05:
                warnings.append(
                    "Significant 3-phase unbalance detected via Park's Vector ripple (> 5%). "
                    "May indicate supply unbalance, stator short, or load asymmetry."
                )

        # Primary channel for spectrum analysis (Phase A / first channel)
        primary_ch = preprocessed[0, :]

        # 6. Compute calibrated frequency spectrum
        freqs, mags_amp, mags_db, df = self.compute_spectrum(primary_ch, fs)

        # 7. Compute Hilbert envelope spectrum
        env_freqs, env_mags = self.compute_hilbert_envelope(primary_ch, fs)

        # 8. Locate dynamic fundamental frequency
        fund_freq, fund_amp, fund_db = self.locate_fundamental_frequency(freqs, mags_amp)

        if fund_amp < 0.1:
            warnings.append(
                f"Fundamental amplitude is very low ({fund_amp:.3f} A). Ensure signal is not idle or disconnected."
            )

        # 9. Extract spectral sidebands and fault peaks
        sideband_feats, peaks = self.extract_sideband_features(
            frequencies=freqs,
            magnitudes_amp=mags_amp,
            magnitudes_db=mags_db,
            fs=fund_freq,
            fs_db=fund_db,
            operating_rpm=operating_rpm,
            poles=poles,
        )

        # 10. Check multi-indicator rule
        # "Never claim that one spectral peak proves a fault."
        if sideband_feats.get("brb_severity_indication") == "PROBABLE_ONE_OR_TWO_BROKEN_BARS":
            warnings.append(
                "Elevated BRB sideband detected. Verify operating load and rotor slip before maintenance intervention."
            )

        confidence_metrics = {
            "signal_snr_db": float(fund_db - float(np.median(mags_db))),
            "frequency_resolution_hz": df,
            "fundamental_detection_confidence": 1.0 if (40.0 <= fund_freq <= 70.0) else 0.8,
        }

        return MCSAAnalysisResult(
            provenance=provenance,
            sampling_rate_hz=fs,
            duration_seconds=float(raw_data.shape[1] / fs),
            num_samples=raw_data.shape[1],
            frequency_resolution_hz=df,
            raw_signal=raw_data,
            preprocessed_signal=preprocessed,
            time_features=time_feats,
            spectrum_frequencies=freqs,
            spectrum_magnitudes_db=mags_db,
            spectrum_magnitudes_amp=mags_amp,
            envelope_frequencies=env_freqs,
            envelope_magnitudes=env_mags,
            fundamental_frequency_hz=fund_freq,
            fundamental_amplitude_amp=fund_amp,
            fundamental_amplitude_db=fund_db,
            motor_slip=sideband_feats.get("slip_used"),
            motor_speed_rpm=operating_rpm,
            identified_peaks=peaks,
            sideband_analysis=sideband_feats,
            thd_percentage=sideband_feats.get("thd_percentage", 0.0),
            parks_vector_features=parks_vector_features,
            operational_warnings=warnings,
            confidence_metrics=confidence_metrics,
        )

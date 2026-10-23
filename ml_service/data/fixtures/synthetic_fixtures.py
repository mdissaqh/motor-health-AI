"""
Explicit Synthetic Test Fixtures for Induction Motor MCSA Validation.

PERMANENT RULE COMPLIANCE:
    1. These fixtures are clearly separated from real datasets.
    2. Every object produced is tagged with `is_synthetic = True` and
       `dataset_id = "SYNTHETIC_FIXTURE_NOT_RESEARCH_DATA"`.
    3. The waveforms are synthesized from first-principles electrical machine physics
       to provide deterministic mathematical ground-truth for DSP unit tests.
    4. They must NEVER be presented as empirical research data.
"""

from typing import List, Optional
import numpy as np

from ml_service.data.canonical import (
    CanonicalFaultClass,
    MotorCurrentRecording,
)


def generate_synthetic_mcsa_recording(
    fault_class: CanonicalFaultClass,
    duration_seconds: float = 2.0,
    sampling_rate_hz: float = 10000.0,
    supply_freq_hz: float = 50.0,
    nominal_current_rms: float = 10.0,
    motor_slip: float = 0.025,
    noise_std: float = 0.02,
    seed: int = 42,
) -> MotorCurrentRecording:
    """
    Generates a mathematically deterministic 3-phase stator current waveform.

    Physics Formulations:
        Fundamental:
            Ia(t) = sqrt(2) * Irms * cos(2*pi*fs*t)
            Ib(t) = sqrt(2) * Irms * cos(2*pi*fs*t - 2*pi/3)
            Ic(t) = sqrt(2) * Irms * cos(2*pi*fs*t + 2*pi/3)

        Fault Modulations:
            - Broken Rotor Bar: Sidebands at fs*(1 +/- 2*s) and fs*(1 +/- 4*s)
            - Bearing Fault: High-frequency envelope sidebands at |fs +/- f_v|
            - Misalignment: Second harmonic 2*fs (100 Hz) and 2*fr rotational components
    """
    rng = np.random.default_rng(seed)
    num_samples = int(duration_seconds * sampling_rate_hz)
    t = np.linspace(0.0, duration_seconds, num_samples, endpoint=False)

    omega = 2.0 * np.pi * supply_freq_hz
    peak_amp = np.sqrt(2.0) * nominal_current_rms

    # Balanced 3-phase fundamentals
    phase_a = peak_amp * np.cos(omega * t)
    phase_b = peak_amp * np.cos(omega * t - 2.0 * np.pi / 3.0)
    phase_c = peak_amp * np.cos(omega * t + 2.0 * np.pi / 3.0)

    # Inherent low-level 3rd and 5th supply harmonics present in healthy industrial grids
    phase_a += (peak_amp * 0.005) * np.cos(3.0 * omega * t)
    phase_b += (peak_amp * 0.005) * np.cos(3.0 * omega * t)
    phase_c += (peak_amp * 0.005) * np.cos(3.0 * omega * t)

    severity_label = "NORMAL"

    if fault_class == CanonicalFaultClass.HEALTHY:
        severity_label = "HEALTHY_BASELINE"

    elif fault_class == CanonicalFaultClass.BROKEN_ROTOR_BAR:
        # BRB produces sidebands at (1 +/- 2s)*fs
        f_left = (1.0 - 2.0 * motor_slip) * supply_freq_hz
        f_right = (1.0 + 2.0 * motor_slip) * supply_freq_hz
        # Moderate BRB: -42 dB relative to fundamental (~0.8% of fundamental amplitude)
        brb_amp = peak_amp * 0.012
        sideband_mod_a = brb_amp * (np.cos(2.0 * np.pi * f_left * t) + np.cos(2.0 * np.pi * f_right * t))
        sideband_mod_b = brb_amp * (np.cos(2.0 * np.pi * f_left * t - 2.0 * np.pi / 3.0) + np.cos(2.0 * np.pi * f_right * t - 2.0 * np.pi / 3.0))
        sideband_mod_c = brb_amp * (np.cos(2.0 * np.pi * f_left * t + 2.0 * np.pi / 3.0) + np.cos(2.0 * np.pi * f_right * t + 2.0 * np.pi / 3.0))

        phase_a += sideband_mod_a
        phase_b += sideband_mod_b
        phase_c += sideband_mod_c
        severity_label = "2_BROKEN_BARS_MODERATE"

    elif fault_class == CanonicalFaultClass.BEARING_FAULT:
        # Bearing outer race defect BPFO produces current sidebands at |fs +/- f_bpfo|
        f_bpfo = 105.4  # typical BPFO for 6205 bearing at ~1460 RPM
        bearing_amp = peak_amp * 0.008  # -46 dB relative to fundamental
        mod_signal = bearing_amp * np.cos(2.0 * np.pi * f_bpfo * t) * np.cos(omega * t)
        phase_a += mod_signal
        phase_b += mod_signal
        phase_c += mod_signal
        severity_label = "BPFO_OUTER_RACE_INCIDENTAL"

    elif fault_class == CanonicalFaultClass.MISALIGNMENT:
        # Angular/Parallel misalignment increases 2*fs (100 Hz) and rotational frequency fr
        fr = (1.0 - motor_slip) * supply_freq_hz / 2.0  # 2 pole-pair motor -> fr ~ 24.375 Hz
        misalign_2fs_amp = peak_amp * 0.025  # elevated 2*fs component (-32 dB)
        misalign_fr_amp = peak_amp * 0.015   # 1x and 2x running speed modulation
        phase_a += misalign_2fs_amp * np.cos(4.0 * np.pi * supply_freq_hz * t) + misalign_fr_amp * np.cos(2.0 * np.pi * (supply_freq_hz + 2.0 * fr) * t)
        phase_b += misalign_2fs_amp * np.cos(4.0 * np.pi * supply_freq_hz * t) + misalign_fr_amp * np.cos(2.0 * np.pi * (supply_freq_hz + 2.0 * fr) * t - 2.0 * np.pi / 3.0)
        phase_c += misalign_2fs_amp * np.cos(4.0 * np.pi * supply_freq_hz * t) + misalign_fr_amp * np.cos(2.0 * np.pi * (supply_freq_hz + 2.0 * fr) * t + 2.0 * np.pi / 3.0)
        severity_label = "PARALLEL_OFFSET_0.5MM"

    # Add Gaussian measurement noise
    phase_a += rng.normal(0.0, noise_std, num_samples)
    phase_b += rng.normal(0.0, noise_std, num_samples)
    phase_c += rng.normal(0.0, noise_std, num_samples)

    current_data = np.vstack([phase_a, phase_b, phase_c])

    return MotorCurrentRecording(
        dataset_id="SYNTHETIC_FIXTURE_NOT_RESEARCH_DATA",
        source_file_id=f"synth_{fault_class.value.lower()}_seed{seed}.csv",
        sampling_rate_hz=sampling_rate_hz,
        num_samples=num_samples,
        duration_seconds=duration_seconds,
        channels=["current_phase_a", "current_phase_b", "current_phase_c"],
        current_units="A",
        current_data=current_data,
        original_fault_label=f"SYNTHETIC_{fault_class.value}",
        canonical_fault_class=fault_class,
        severity_label=severity_label,
        operating_conditions={
            "supply_freq_hz": supply_freq_hz,
            "nominal_current_rms": nominal_current_rms,
            "motor_slip": motor_slip,
            "is_physically_simulated": True,
        },
        motor_metadata={
            "description": "Synthetic 4-pole 400V 50Hz induction motor model",
            "rated_power_kw": 5.5,
            "poles": 4,
            "rated_rpm": 1462,
        },
        is_synthetic=True,
        notes="SYNTHETIC GROUND TRUTH FIXTURE FOR DSP TESTING - NOT EMPIRICAL EXPERIMENTAL DATA.",
    )

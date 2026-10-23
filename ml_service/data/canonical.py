"""
Canonical Data Schema and Validation for Motor Current Signature Analysis (MCSA).

This module defines the universal, dataset-agnostic data structures and validation
rules for induction motor current recordings.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional
import numpy as np


class CanonicalFaultClass(str, Enum):
    """
    Standardized fault classifications across all motor diagnostics datasets.
    """
    HEALTHY = "HEALTHY"
    BROKEN_ROTOR_BAR = "BROKEN_ROTOR_BAR"
    BEARING_FAULT = "BEARING_FAULT"
    MISALIGNMENT = "MISALIGNMENT"
    OTHER_FAULT = "OTHER_FAULT"


@dataclass
class MotorCurrentRecording:
    """
    Canonical representation of a motor current time-series recording.

    PERMANENT RULE:
    `current_data` must contain ONLY electrical current waveforms (e.g. Ia, Ib, Ic).
    Vibration, acoustic, or voltage signals must NEVER be stored in `current_data`.
    """
    dataset_id: str
    source_file_id: str
    sampling_rate_hz: float
    num_samples: int
    duration_seconds: float
    channels: List[str]  # e.g. ["current_phase_a", "current_phase_b", "current_phase_c"]
    current_units: str   # e.g. "A" for Amperes
    current_data: np.ndarray  # Shape: (num_channels, num_samples)
    original_fault_label: str
    canonical_fault_class: CanonicalFaultClass
    severity_label: Optional[str] = None
    operating_conditions: Dict[str, Any] = field(default_factory=dict)
    motor_metadata: Dict[str, Any] = field(default_factory=dict)
    is_synthetic: bool = False
    notes: Optional[str] = None

    def __post_init__(self):
        """Validate input parameters upon instantiation."""
        validate_recording_fields(
            sampling_rate_hz=self.sampling_rate_hz,
            current_data=self.current_data,
            channels=self.channels,
            num_samples=self.num_samples,
        )


def validate_recording_fields(
    sampling_rate_hz: float,
    current_data: np.ndarray,
    channels: List[str],
    num_samples: int,
) -> None:
    """
    Validates motor current data and rejects malformed inputs.
    
    Raises:
        ValueError: If any validation check fails.
    """
    if sampling_rate_hz is None or sampling_rate_hz <= 0:
        raise ValueError(
            f"Invalid sampling rate: {sampling_rate_hz} Hz. Sampling rate must be strictly positive."
        )

    if not isinstance(current_data, np.ndarray):
        raise ValueError("current_data must be a numpy.ndarray.")

    if current_data.size == 0:
        raise ValueError("current_data cannot be empty.")

    if current_data.ndim != 2:
        raise ValueError(
            f"current_data must be a 2D array of shape (num_channels, num_samples), "
            f"got ndim={current_data.ndim} with shape={current_data.shape}."
        )

    num_channels, samples = current_data.shape

    if num_channels != len(channels):
        raise ValueError(
            f"Channel mismatch: current_data has {num_channels} rows but {len(channels)} channel names provided."
        )

    if samples != num_samples:
        raise ValueError(
            f"Sample count mismatch: array has {samples} points, expected {num_samples}."
        )

    if samples < 100:
        raise ValueError(
            f"Insufficient samples: recording has only {samples} samples, minimum required is 100 for DSP."
        )

    if np.any(np.isnan(current_data)):
        raise ValueError("current_data contains NaN values.")

    if np.any(np.isinf(current_data)):
        raise ValueError("current_data contains infinite (Inf) values.")

    # Check for forbidden sensor terms in channel labels
    forbidden_terms = ["vibration", "accel", "voltage", "volts", "acoustic"]
    for ch in channels:
        ch_lower = ch.lower()
        for forbidden in forbidden_terms:
            if forbidden in ch_lower:
                raise ValueError(
                    f"Forbidden sensor type detected in current channel label: '{ch}'. "
                    f"MCSA pipeline accepts exclusively electrical current signals."
                )

"""
Dataset Adapter for 4TU Centrifugal Pump Motor Current & Vibration Dataset (NLN-EMP).

Source:
    S.J. Bruinsma, R.D. Geertsma, R. Loendersloot, T. Tinga (2024).
    "Motor Current and Vibration Monitoring Dataset for various Faults in an E-motor-driven Centrifugal Pump."
    Data in Brief, Volume 52, 109987.
    DOI: 10.4121/2b61183e-c14f-4131-829b-cc4822c369d0
    License: Creative Commons Attribution 4.0 International (CC BY 4.0)

PERMANENT RULE ENFORCEMENT:
    Although the 4TU raw dataset includes 3 voltage taps and 5 accelerometer channels,
    this adapter explicitly extracts ONLY the 3 phase current channels (I_u, I_v, I_w).
    All voltage and vibration columns are deliberately discarded during ingestion.
"""

from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union
import numpy as np

from ml_service.data.base_adapter import BaseDatasetAdapter
from ml_service.data.canonical import (
    CanonicalFaultClass,
    MotorCurrentRecording,
)


class NLNEMPAdapter(BaseDatasetAdapter):
    """
    Adapter for the 4TU.ResearchData Netherlands Navy E-motor Pump (NLN-EMP) dataset.
    """

    DATASET_ID = "4TU_NLN_EMP"
    CITATION = (
        "Bruinsma, S.J., Geertsma, R.D., Loendersloot, R., & Tinga, T. (2024). "
        "Motor current and vibration monitoring dataset for various faults in an "
        "E-motor-driven centrifugal pump. Data in Brief, 52, 109987. "
        "DOI: 10.4121/2b61183e-c14f-4131-829b-cc4822c369d0"
    )
    LICENSE = "CC BY 4.0"
    DEFAULT_SAMPLING_RATE_HZ = 20000.0  # 20 kHz
    CHANNELS = ["current_phase_u", "current_phase_v", "current_phase_w"]
    CURRENT_UNITS = "A"

    # Canonical mapping dictionary for 4TU fault descriptors
    LABEL_MAPPING = {
        # Healthy
        "healthy": (CanonicalFaultClass.HEALTHY, "NORMAL_BASELINE"),
        "baseline": (CanonicalFaultClass.HEALTHY, "NORMAL_BASELINE"),
        "normal": (CanonicalFaultClass.HEALTHY, "NORMAL_BASELINE"),
        # Broken Rotor Bar
        "broken_rotor_bar_1": (CanonicalFaultClass.BROKEN_ROTOR_BAR, "1_DRILLED_BAR"),
        "broken_rotor_bar_2": (CanonicalFaultClass.BROKEN_ROTOR_BAR, "2_DRILLED_BARS"),
        "broken_rotor_bar_3": (CanonicalFaultClass.BROKEN_ROTOR_BAR, "3_DRILLED_BARS"),
        "brb_1": (CanonicalFaultClass.BROKEN_ROTOR_BAR, "1_DRILLED_BAR"),
        "brb_2": (CanonicalFaultClass.BROKEN_ROTOR_BAR, "2_DRILLED_BARS"),
        "brb_3": (CanonicalFaultClass.BROKEN_ROTOR_BAR, "3_DRILLED_BARS"),
        # Bearing Faults
        "bearing_outer_race": (CanonicalFaultClass.BEARING_FAULT, "OUTER_RACE_DEFECT"),
        "bearing_inner_race": (CanonicalFaultClass.BEARING_FAULT, "INNER_RACE_DEFECT"),
        "bearing_lubrication": (CanonicalFaultClass.BEARING_FAULT, "CONTAMINATED_LUBRICANT"),
        "bearing_degraded": (CanonicalFaultClass.BEARING_FAULT, "GENERAL_BEARING_DEGRADATION"),
        # Misalignment
        "misalignment_angular": (CanonicalFaultClass.MISALIGNMENT, "ANGULAR_MISALIGNMENT"),
        "misalignment_parallel": (CanonicalFaultClass.MISALIGNMENT, "PARALLEL_MISALIGNMENT"),
        "misalignment": (CanonicalFaultClass.MISALIGNMENT, "COMBINED_MISALIGNMENT"),
        # Additional faults (categorized as OTHER_FAULT)
        "stator_winding_short": (CanonicalFaultClass.OTHER_FAULT, "STATOR_INTER_TURN_SHORT"),
        "unbalance": (CanonicalFaultClass.OTHER_FAULT, "ROTOR_UNBALANCE"),
        "bent_shaft": (CanonicalFaultClass.OTHER_FAULT, "BENT_SHAFT"),
        "soft_foot": (CanonicalFaultClass.OTHER_FAULT, "SOFT_FOOT"),
        "cavitation": (CanonicalFaultClass.OTHER_FAULT, "PUMP_CAVITATION"),
        "impeller_damage": (CanonicalFaultClass.OTHER_FAULT, "IMPELLER_DAMAGE"),
    }

    @property
    def dataset_id(self) -> str:
        return self.DATASET_ID

    @property
    def citation(self) -> str:
        return self.CITATION

    @property
    def license(self) -> str:
        return self.LICENSE

    def map_label(self, source_label: str) -> Tuple[CanonicalFaultClass, Optional[str]]:
        """Maps 4TU original label to CanonicalFaultClass and severity."""
        normalized = source_label.strip().lower().replace(" ", "_").replace("-", "_")
        if normalized in self.LABEL_MAPPING:
            return self.LABEL_MAPPING[normalized]
        
        # Fuzzy fallback for compound strings
        if "rotor_bar" in normalized or "brb" in normalized:
            return (CanonicalFaultClass.BROKEN_ROTOR_BAR, "BROKEN_BAR_UNSPECIFIED")
        if "bearing" in normalized:
            return (CanonicalFaultClass.BEARING_FAULT, "BEARING_UNSPECIFIED")
        if "misalign" in normalized:
            return (CanonicalFaultClass.MISALIGNMENT, "MISALIGNMENT_UNSPECIFIED")
        if "healthy" in normalized or "baseline" in normalized:
            return (CanonicalFaultClass.HEALTHY, "NORMAL_BASELINE")

        return (CanonicalFaultClass.OTHER_FAULT, source_label.upper())

    def load_recording(
        self,
        file_path_or_buffer: Union[str, Path, Any],
        source_label: str = "healthy",
        sampling_rate_hz: Optional[float] = None,
        operating_conditions: Optional[Dict[str, Any]] = None,
        motor_metadata: Optional[Dict[str, Any]] = None,
    ) -> MotorCurrentRecording:
        """
        Loads a 4TU data file (CSV format).

        Expected CSV column structure in 4TU dataset:
            Col 0: I_u (Phase U Current, A)
            Col 1: I_v (Phase V Current, A)
            Col 2: I_w (Phase W Current, A)
            [Col 3-5: Voltages - DISCARDED]
            [Col 6-10: Vibrations - DISCARDED]
        """
        fs = sampling_rate_hz or self.DEFAULT_SAMPLING_RATE_HZ

        if isinstance(file_path_or_buffer, (str, Path)):
            path = Path(file_path_or_buffer)
            source_file_id = path.name
            raw_data = np.loadtxt(path, delimiter=",", skiprows=1 if self._has_header(path) else 0)
        elif isinstance(file_path_or_buffer, np.ndarray):
            source_file_id = "in_memory_array"
            raw_data = file_path_or_buffer
        else:
            raise ValueError(f"Unsupported file_path_or_buffer type: {type(file_path_or_buffer)}")

        # Ensure 2D
        if raw_data.ndim == 1:
            raw_data = raw_data.reshape(-1, 1)

        # Transpose if rows > cols (time-series typically has shape (N_samples, N_columns))
        if raw_data.shape[0] > raw_data.shape[1]:
            # Take first 3 columns as Phase U, V, W currents
            if raw_data.shape[1] < 3:
                # If single-phase current was provided
                current_data = raw_data[:, [0]].T
                channels = [self.CHANNELS[0]]
            else:
                # Explicitly take columns 0, 1, 2 (Currents ONLY; discard voltages 3..5 and vibrations 6..10)
                current_data = raw_data[:, 0:3].T
                channels = self.CHANNELS[:3]
        else:
            # Already shape (num_channels, num_samples)
            current_data = raw_data[0:min(3, raw_data.shape[0]), :]
            channels = self.CHANNELS[:current_data.shape[0]]

        canonical_class, severity = self.map_label(source_label)

        default_motor_meta = {
            "motor_type": "3-phase squirrel-cage induction motor",
            "rated_power_kw": 11.0,
            "nominal_voltage_v": 400.0,
            "poles": 4,
            "rated_rpm": 1470,
            "supply_frequency_hz": 50.0,
        }
        if motor_metadata:
            default_motor_meta.update(motor_metadata)

        default_operating = {
            "vfd_frequency_hz": 50.0,
            "sampling_frequency_hz": fs,
        }
        if operating_conditions:
            default_operating.update(operating_conditions)

        return MotorCurrentRecording(
            dataset_id=self.DATASET_ID,
            source_file_id=source_file_id,
            sampling_rate_hz=fs,
            num_samples=current_data.shape[1],
            duration_seconds=current_data.shape[1] / fs,
            channels=channels,
            current_units=self.CURRENT_UNITS,
            current_data=current_data,
            original_fault_label=source_label,
            canonical_fault_class=canonical_class,
            severity_label=severity,
            operating_conditions=default_operating,
            motor_metadata=default_motor_meta,
            is_synthetic=False,
            notes="Extracted from 4TU.ResearchData NLN-EMP (Bruinsma et al., 2024). Voltage and vibration excluded.",
        )

    def _has_header(self, path: Path) -> bool:
        """Helper to detect if the first line is non-numeric text header."""
        try:
            with open(path, "r", encoding="utf-8") as f:
                first_line = f.readline().strip()
                # Check if first item parses as float
                first_val = first_line.split(",")[0].strip()
                float(first_val)
                return False
        except (ValueError, IndexError):
            return True

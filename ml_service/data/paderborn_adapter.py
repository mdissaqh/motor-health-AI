"""
Dataset Adapter for Paderborn University Bearing Dataset.

Source:
    Lessmeier, C., Kimotho, J. K., Zimmer, D., & Sexton, D. (2016).
    "Condition Monitoring of Bearing Damage in Electromechanical Drive Systems
    by Using Motor Current Signals of Electric Motors: A Benchmark Data Set for
    Data-Driven Classification." PHM Society Conference.
    Repository: https://mb.uni-paderborn.de/kat/forschung/datensaetze/bearing-data-center/
    License: Creative Commons Attribution (CC BY 4.0)

PERMANENT RULE ENFORCEMENT:
    Paderborn dataset includes vibration acceleration channels.
    This adapter extracts ONLY the 2 LEM transducer phase current channels.
    Vibration channels are strictly excluded from the diagnostic current payload.

GAP DOCUMENTATION:
    Paderborn test rig employs a Permanent-Magnet Synchronous Motor (PMSM).
    Because PMSMs have permanent magnets rather than a squirrel-cage rotor,
    Broken Rotor Bars (BRB) are physically absent. Furthermore, mechanical
    misalignment was not tested in this dataset.
"""

from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union
import numpy as np

from ml_service.data.base_adapter import BaseDatasetAdapter
from ml_service.data.canonical import (
    CanonicalFaultClass,
    MotorCurrentRecording,
)


class PaderbornAdapter(BaseDatasetAdapter):
    """
    Adapter for the Paderborn University bearing current dataset.
    """

    DATASET_ID = "PADERBORN_BEARING"
    CITATION = (
        "Lessmeier, C., Kimotho, J. K., Zimmer, D., & Sexton, D. (2016). "
        "Condition Monitoring of Bearing Damage in Electromechanical Drive Systems "
        "by Using Motor Current Signals of Electric Motors. PHM Society. "
        "https://mb.uni-paderborn.de/kat/forschung/datensaetze/bearing-data-center/"
    )
    LICENSE = "CC BY 4.0"
    DEFAULT_SAMPLING_RATE_HZ = 64000.0  # 64 kHz
    CHANNELS = ["phase_current_1", "phase_current_2"]
    CURRENT_UNITS = "A"

    LABEL_MAPPING = {
        # Healthy bearings K001 - K006
        "k001": (CanonicalFaultClass.HEALTHY, "HEALTHY_BEARING_REF"),
        "k002": (CanonicalFaultClass.HEALTHY, "HEALTHY_BEARING_REF"),
        "k003": (CanonicalFaultClass.HEALTHY, "HEALTHY_BEARING_REF"),
        "k004": (CanonicalFaultClass.HEALTHY, "HEALTHY_BEARING_REF"),
        "k005": (CanonicalFaultClass.HEALTHY, "HEALTHY_BEARING_REF"),
        "k006": (CanonicalFaultClass.HEALTHY, "HEALTHY_BEARING_REF"),
        "healthy": (CanonicalFaultClass.HEALTHY, "HEALTHY_BEARING_REF"),
        # Outer ring damage KA
        "ka01": (CanonicalFaultClass.BEARING_FAULT, "OUTER_RING_EDM_LEVEL_1"),
        "ka03": (CanonicalFaultClass.BEARING_FAULT, "OUTER_RING_EDM_LEVEL_2"),
        "ka05": (CanonicalFaultClass.BEARING_FAULT, "OUTER_RING_FATIGUE_LEVEL_1"),
        "ka07": (CanonicalFaultClass.BEARING_FAULT, "OUTER_RING_FATIGUE_LEVEL_2"),
        # Inner ring damage KI
        "ki01": (CanonicalFaultClass.BEARING_FAULT, "INNER_RING_EDM_LEVEL_1"),
        "ki03": (CanonicalFaultClass.BEARING_FAULT, "INNER_RING_EDM_LEVEL_2"),
        "ki05": (CanonicalFaultClass.BEARING_FAULT, "INNER_RING_FATIGUE_LEVEL_1"),
        "ki07": (CanonicalFaultClass.BEARING_FAULT, "INNER_RING_FATIGUE_LEVEL_2"),
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
        """Maps Paderborn bearing code to CanonicalFaultClass."""
        normalized = source_label.strip().lower()

        # Check direct mapping
        for code, mapping in self.LABEL_MAPPING.items():
            if code in normalized:
                return mapping

        if "inner" in normalized:
            return (CanonicalFaultClass.BEARING_FAULT, "INNER_RING_DAMAGE")
        if "outer" in normalized:
            return (CanonicalFaultClass.BEARING_FAULT, "OUTER_RING_DAMAGE")
        if "bearing" in normalized:
            return (CanonicalFaultClass.BEARING_FAULT, "BEARING_DAMAGE_UNSPECIFIED")
        if "healthy" in normalized or normalized.startswith("k0"):
            return (CanonicalFaultClass.HEALTHY, "HEALTHY_BEARING_REF")

        # Report physical gaps honestly
        if "broken_rotor_bar" in normalized or "brb" in normalized:
            raise ValueError(
                "Paderborn dataset utilizes a Permanent Magnet Synchronous Motor (PMSM). "
                "PMSM rotors have permanent magnets and no rotor bars. Broken rotor bars "
                "do not exist in this dataset. Consult 4TU NLN-EMP or LIAS MCSA-DC."
            )
        if "misalign" in normalized:
            raise ValueError(
                "Paderborn dataset does not include shaft misalignment recordings. "
                "Consult 4TU NLN-EMP for misalignment current signatures."
            )

        return (CanonicalFaultClass.OTHER_FAULT, source_label)

    def load_recording(
        self,
        file_path_or_buffer: Union[str, Path, Any],
        source_label: Optional[str] = None,
        sampling_rate_hz: Optional[float] = None,
        operating_conditions: Optional[Dict[str, Any]] = None,
        motor_metadata: Optional[Dict[str, Any]] = None,
    ) -> MotorCurrentRecording:
        """
        Loads a Paderborn current recording (from CSV, NPY, or MAT dict).

        Paderborn measures 2 phase currents via LEM CKSR 15-NP sensors.
        Vibration signals are explicitly ignored.
        """
        fs = sampling_rate_hz or self.DEFAULT_SAMPLING_RATE_HZ

        if isinstance(file_path_or_buffer, (str, Path)):
            path = Path(file_path_or_buffer)
            source_file_id = path.name
            raw_data = np.loadtxt(path, delimiter=",")
            inferred_label = source_label or path.stem
        elif isinstance(file_path_or_buffer, np.ndarray):
            source_file_id = "in_memory_array"
            raw_data = file_path_or_buffer
            inferred_label = source_label or "k001"
        else:
            raise ValueError(f"Unsupported file_path_or_buffer type: {type(file_path_or_buffer)}")

        if raw_data.ndim == 1:
            raw_data = raw_data.reshape(-1, 1)

        # Transpose if time-major
        if raw_data.shape[0] > raw_data.shape[1]:
            # Take first 2 columns as phase 1 and phase 2 currents
            current_data = raw_data[:, 0:min(2, raw_data.shape[1])].T
        else:
            current_data = raw_data[0:min(2, raw_data.shape[0]), :]

        channels = self.CHANNELS[:current_data.shape[0]]
        canonical_class, severity = self.map_label(inferred_label)

        default_motor_meta = {
            "motor_type": "Permanent Magnet Synchronous Motor (PMSM)",
            "rated_power_kw": 1.6,
            "nominal_speed_rpm": 1500,
            "current_transducer": "LEM CKSR 15-NP",
        }
        if motor_metadata:
            default_motor_meta.update(motor_metadata)

        default_operating = {
            "sampling_frequency_hz": fs,
            "rotational_speed_rpm": 1500,
            "load_torque_nm": 0.7,
            "radial_force_n": 1000,
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
            original_fault_label=inferred_label,
            canonical_fault_class=canonical_class,
            severity_label=severity,
            operating_conditions=default_operating,
            motor_metadata=default_motor_meta,
            is_synthetic=False,
            notes="Extracted from Paderborn University bearing dataset (Lessmeier et al., 2016). Vibration excluded.",
        )

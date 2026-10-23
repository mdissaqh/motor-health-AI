"""
Dataset Adapter for LIAS MCSA-DC (University of Poitiers / ISAE-ENSMA).

Source:
    LIAS Laboratory, University of Poitiers, France.
    "Motor Current Signature Analysis Data Center (MCSA-DC)."
    Repository: https://github.com/lias-laboratory/mcsa-dc
    License: Creative Commons Attribution 4.0 International (CC BY 4.0)

PERMANENT RULE ENFORCEMENT:
    LIAS CSV recordings include stator voltages (Vsa, Vsb, Vsc), rotational speed,
    and rotor mechanical position. This adapter extracts ONLY the 3 stator phase
    currents (isa, isb, isc in Amperes). All voltages and mechanical signals are
    strictly excluded from the diagnostic current payload.

GAP DOCUMENTATION:
    LIAS Test Bench 1 focuses exclusively on Healthy and Broken Rotor Bar conditions.
    Bearing faults and shaft misalignment are NOT supported in this dataset.
"""

from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union
import numpy as np

from ml_service.data.base_adapter import BaseDatasetAdapter
from ml_service.data.canonical import (
    CanonicalFaultClass,
    MotorCurrentRecording,
)


class LIASAdapter(BaseDatasetAdapter):
    """
    Adapter for the LIAS MCSA-DC dataset.
    """

    DATASET_ID = "LIAS_MCSA_DC"
    CITATION = (
        "LIAS Laboratory, University of Poitiers (2024). "
        "MCSA-DC: Motor Current Signature Analysis Data Center. "
        "https://github.com/lias-laboratory/mcsa-dc"
    )
    LICENSE = "CC BY 4.0"
    DEFAULT_SAMPLING_RATE_HZ = 10000.0
    CHANNELS = ["current_phase_a", "current_phase_b", "current_phase_c"]
    CURRENT_UNITS = "A"

    LABEL_MAPPING = {
        # Healthy files ccs0 - ccs17
        "healthy": (CanonicalFaultClass.HEALTHY, "HEALTHY_ROTOR"),
        "0_broken_bars": (CanonicalFaultClass.HEALTHY, "HEALTHY_ROTOR"),
        # 1 Broken Rotor Bar files ccs60 - ccs67
        "1_broken_bar": (CanonicalFaultClass.BROKEN_ROTOR_BAR, "1_DRILLED_BAR"),
        "broken_rotor_bar_1": (CanonicalFaultClass.BROKEN_ROTOR_BAR, "1_DRILLED_BAR"),
        # 2 Broken Rotor Bars files ccs120 - ccs127
        "2_broken_bars": (CanonicalFaultClass.BROKEN_ROTOR_BAR, "2_DRILLED_BARS"),
        "broken_rotor_bar_2": (CanonicalFaultClass.BROKEN_ROTOR_BAR, "2_DRILLED_BARS"),
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
        """Maps LIAS label or filename to CanonicalFaultClass."""
        normalized = source_label.strip().lower()

        # Filename heuristics: ccs0..ccs17 -> Healthy, ccs60..ccs67 -> 1 bar, ccs120..ccs127 -> 2 bars
        if normalized.startswith("ccs"):
            try:
                num = int("".join([c for c in normalized if c.isdigit()]))
                if 0 <= num <= 17:
                    return (CanonicalFaultClass.HEALTHY, "HEALTHY_ROTOR")
                elif 60 <= num <= 67:
                    return (CanonicalFaultClass.BROKEN_ROTOR_BAR, "1_DRILLED_BAR")
                elif 120 <= num <= 127:
                    return (CanonicalFaultClass.BROKEN_ROTOR_BAR, "2_DRILLED_BARS")
            except ValueError:
                pass

        if normalized in self.LABEL_MAPPING:
            return self.LABEL_MAPPING[normalized]

        if "broken" in normalized or "brb" in normalized:
            return (CanonicalFaultClass.BROKEN_ROTOR_BAR, "BROKEN_BAR_UNSPECIFIED")
        if "healthy" in normalized or "baseline" in normalized:
            return (CanonicalFaultClass.HEALTHY, "HEALTHY_ROTOR")

        # Report absence of bearing and misalignment classes honestly
        if "bearing" in normalized:
            raise ValueError(
                "LIAS MCSA-DC dataset does not contain bearing fault recordings. "
                "Consult the 4TU NLN-EMP or Paderborn datasets for bearing current data."
            )
        if "misalign" in normalized:
            raise ValueError(
                "LIAS MCSA-DC dataset does not contain misalignment recordings. "
                "Consult the 4TU NLN-EMP dataset for misalignment current data."
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
        Loads a LIAS CSV recording.

        Expected LIAS columns:
            Col 0: Time (s)
            Col 1: isa (Stator Current Phase A, A)
            Col 2: isb (Stator Current Phase B, A)
            Col 3: isc (Stator Current Phase C, A)
            [Col 4-6: Vsa, Vsb, Vsc Voltages - DISCARDED]
            [Col 7-8: Speed, Rotor_Pos - DISCARDED]
        """
        if isinstance(file_path_or_buffer, (str, Path)):
            path = Path(file_path_or_buffer)
            source_file_id = path.name
            raw_data = np.loadtxt(path, delimiter=",", skiprows=1 if self._has_header(path) else 0)
            inferred_label = source_label or path.stem
        elif isinstance(file_path_or_buffer, np.ndarray):
            source_file_id = "in_memory_array"
            raw_data = file_path_or_buffer
            inferred_label = source_label or "healthy"
        else:
            raise ValueError(f"Unsupported file_path_or_buffer type: {type(file_path_or_buffer)}")

        # Check dimension
        if raw_data.ndim == 1:
            raw_data = raw_data.reshape(-1, 1)

        # Transpose if time-major
        if raw_data.shape[0] > raw_data.shape[1]:
            # If Time is col 0 and currents are cols 1, 2, 3
            if raw_data.shape[1] >= 4:
                # Compute sampling rate from time column if not explicitly given
                if sampling_rate_hz is None:
                    time_col = raw_data[:, 0]
                    dt = np.mean(np.diff(time_col))
                    fs = float(np.round(1.0 / dt)) if dt > 0 else self.DEFAULT_SAMPLING_RATE_HZ
                else:
                    fs = sampling_rate_hz
                # Extract cols 1, 2, 3 as phase currents (discard voltages 4..6 and speed/pos 7..8)
                current_data = raw_data[:, 1:4].T
                channels = self.CHANNELS[:3]
            elif raw_data.shape[1] == 3:
                # 3 current columns directly
                fs = sampling_rate_hz or self.DEFAULT_SAMPLING_RATE_HZ
                current_data = raw_data[:, 0:3].T
                channels = self.CHANNELS[:3]
            else:
                fs = sampling_rate_hz or self.DEFAULT_SAMPLING_RATE_HZ
                current_data = raw_data[:, [0]].T
                channels = [self.CHANNELS[0]]
        else:
            fs = sampling_rate_hz or self.DEFAULT_SAMPLING_RATE_HZ
            current_data = raw_data[0:min(3, raw_data.shape[0]), :]
            channels = self.CHANNELS[:current_data.shape[0]]

        canonical_class, severity = self.map_label(inferred_label)

        default_motor_meta = {
            "motor_type": "3-phase squirrel-cage induction motor",
            "rated_power_kw": 1.1,
            "nominal_voltage_v": 400.0,
            "poles": 4,
            "rated_rpm": 1425,
            "supply_frequency_hz": 50.0,
        }
        if motor_metadata:
            default_motor_meta.update(motor_metadata)

        default_operating = {
            "supply_type": "direct_grid",
            "nominal_speed_rpm": 1425,
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
            original_fault_label=inferred_label,
            canonical_fault_class=canonical_class,
            severity_label=severity,
            operating_conditions=default_operating,
            motor_metadata=default_motor_meta,
            is_synthetic=False,
            notes="Extracted from LIAS MCSA-DC (University of Poitiers). Voltages and speed discarded.",
        )

    def _has_header(self, path: Path) -> bool:
        """Helper to detect if first line is a header."""
        try:
            with open(path, "r", encoding="utf-8") as f:
                first_line = f.readline().strip()
                float(first_line.split(",")[0].strip())
                return False
        except (ValueError, IndexError):
            return True

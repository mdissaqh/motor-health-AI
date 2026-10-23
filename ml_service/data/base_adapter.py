"""
Base Dataset Adapter Interface for Motor Current Signature Analysis (MCSA).

All dataset-specific loaders must inherit from BaseDatasetAdapter and implement
the load_recording and map_label methods.
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union
import numpy as np

from ml_service.data.canonical import (
    CanonicalFaultClass,
    MotorCurrentRecording,
    validate_recording_fields,
)


class BaseDatasetAdapter(ABC):
    """
    Abstract Base Class for Dataset Ingestion Adapters.
    """

    @property
    @abstractmethod
    def dataset_id(self) -> str:
        """Unique identifier for this dataset."""
        pass

    @property
    @abstractmethod
    def citation(self) -> str:
        """Full bibliographic citation and DOI for dataset attribution."""
        pass

    @property
    @abstractmethod
    def license(self) -> str:
        """Dataset license (e.g., 'CC BY 4.0')."""
        pass

    @abstractmethod
    def map_label(self, source_label: str) -> Tuple[CanonicalFaultClass, Optional[str]]:
        """
        Maps an original dataset-specific label to (CanonicalFaultClass, severity_label).
        """
        pass

    @abstractmethod
    def load_recording(
        self,
        file_path_or_buffer: Union[str, Path, Any],
        **kwargs: Any,
    ) -> MotorCurrentRecording:
        """
        Loads raw file content, extracts ONLY motor current channels, and returns
        a validated MotorCurrentRecording instance.
        """
        pass

    def validate_current_signal(
        self,
        current_data: np.ndarray,
        sampling_rate_hz: float,
        channels: list,
    ) -> None:
        """Helper to run standard validation."""
        validate_recording_fields(
            sampling_rate_hz=sampling_rate_hz,
            current_data=current_data,
            channels=channels,
            num_samples=current_data.shape[1] if current_data.ndim == 2 else 0,
        )

"""
Motor Health AI - Data Ingestion and Adapter Package.
"""

from ml_service.data.canonical import (
    CanonicalFaultClass,
    MotorCurrentRecording,
    validate_recording_fields,
)
from ml_service.data.base_adapter import BaseDatasetAdapter
from ml_service.data.nln_emp_adapter import NLNEMPAdapter
from ml_service.data.lias_adapter import LIASAdapter
from ml_service.data.paderborn_adapter import PaderbornAdapter

__all__ = [
    "CanonicalFaultClass",
    "MotorCurrentRecording",
    "validate_recording_fields",
    "BaseDatasetAdapter",
    "NLNEMPAdapter",
    "LIASAdapter",
    "PaderbornAdapter",
]

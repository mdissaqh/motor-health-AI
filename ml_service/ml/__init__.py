"""
Motor Health AI - Machine Learning Fault Diagnosis Package.
"""

from ml_service.ml.features import FEATURE_COLUMNS, extract_ml_features, feature_dict_to_vector
from ml_service.ml.inference import MCSAPredictor, DiagnosticPrediction
from ml_service.ml.dataset import CLASS_TO_INT, INT_TO_CLASS

__all__ = [
    "FEATURE_COLUMNS",
    "extract_ml_features",
    "feature_dict_to_vector",
    "MCSAPredictor",
    "DiagnosticPrediction",
    "CLASS_TO_INT",
    "INT_TO_CLASS",
]

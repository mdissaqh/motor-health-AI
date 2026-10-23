"""
Feature Extraction for Machine Learning Fault Classification.

Transforms an MCSAAnalysisResult (from Phase 2 DSP) into a fixed-length,
reproducible numeric feature vector.

PERMANENT RULES:
- NO filenames, paths, or labels are included in the feature vector.
- NO voltage, acoustic, or vibration sensor signals are included.
- Features are pure mathematical and physical representations of electrical current.
"""

from typing import Dict, List
import numpy as np

from ml_service.dsp.pipeline import MCSAAnalysisResult

# Strict, canonical 16-dimensional feature column schema
FEATURE_COLUMNS: List[str] = [
    # Time-Domain Statistical Metrics (6 features)
    "rms_current",
    "crest_factor",
    "form_factor",
    "kurtosis",
    "skewness",
    "peak_to_peak",
    # Fundamental & Harmonic Metrics (5 features)
    "fundamental_freq",
    "fundamental_amp",
    "thd_percentage",
    "second_harmonic_delta_db",
    "third_harmonic_delta_db",
    # MCSA Fault Sidebands (4 features)
    "brb_min_delta_db",
    "brb_left_delta_db",
    "brb_right_delta_db",
    "slip_estimated",
    # Multi-Phase Asymmetry (1 feature)
    "parks_vector_unbalance_ratio",
]


def extract_ml_features(analysis_result: MCSAAnalysisResult) -> Dict[str, float]:
    """
    Extracts the canonical numeric feature dictionary from an MCSAAnalysisResult.

    Args:
        analysis_result: MCSAAnalysisResult instance from MCSAEngine.analyze().

    Returns:
        Dict mapping feature names in FEATURE_COLUMNS to float values.
    """
    tf = analysis_result.time_features
    sb = analysis_result.sideband_analysis
    pv = analysis_result.parks_vector_features

    # Handle single-phase vs 3-phase channel naming fallback
    # Time features typically have prefix 'current_phase_u_' or 'current_ch_0_'
    def get_time_metric(metric_name: str, default: float = 0.0) -> float:
        for k, v in tf.items():
            if k.endswith(metric_name):
                return float(v)
        return float(tf.get(metric_name, default))

    features: Dict[str, float] = {
        # Time-Domain
        "rms_current": get_time_metric("rms", default=0.0),
        "crest_factor": get_time_metric("crest_factor", default=1.414),
        "form_factor": get_time_metric("form_factor", default=1.11),
        "kurtosis": get_time_metric("kurtosis", default=0.0),
        "skewness": get_time_metric("skewness", default=0.0),
        "peak_to_peak": get_time_metric("peak_to_peak", default=0.0),
        # Fundamental & Harmonics
        "fundamental_freq": float(analysis_result.fundamental_frequency_hz),
        "fundamental_amp": float(analysis_result.fundamental_amplitude_amp),
        "thd_percentage": float(analysis_result.thd_percentage),
        "second_harmonic_delta_db": float(sb.get("second_harmonic_delta_db", 60.0)),
        "third_harmonic_delta_db": float(
            analysis_result.fundamental_amplitude_db - sb.get("third_harmonic_amp_db", -60.0)
        ),
        # Fault Sidebands
        "brb_min_delta_db": float(sb.get("brb_min_delta_db", 70.0)),
        "brb_left_delta_db": float(sb.get("brb_left_delta_db", 70.0)),
        "brb_right_delta_db": float(sb.get("brb_right_delta_db", 70.0)),
        "slip_estimated": float(sb.get("slip_used", 0.02)),
        # Multi-Phase Asymmetry
        "parks_vector_unbalance_ratio": float(pv.get("parks_vector_unbalance_ratio", 0.0)),
    }

    # Ensure all values are finite float numbers (replace NaNs with safe defaults)
    for k in FEATURE_COLUMNS:
        val = features.get(k, 0.0)
        if np.isnan(val) or np.isinf(val):
            features[k] = 0.0

    return features


def feature_dict_to_vector(features: Dict[str, float]) -> np.ndarray:
    """Converts feature dict to an ordered 1D numpy array matching FEATURE_COLUMNS."""
    return np.array([features.get(col, 0.0) for col in FEATURE_COLUMNS], dtype=np.float64)

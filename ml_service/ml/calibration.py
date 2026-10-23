"""
Probability Calibration Engine for Motor Current Signature Analysis.

Evaluates and applies probability calibration methods:
- Platt Scaling (Multinomial Logistic Regression over raw ensemble vote logits)
- Isotonic Regression (piecewise constant calibration)
- Metrics: Brier Score, Multiclass Log Loss, Expected Calibration Error (ECE)

Applies calibration only when empirically justified on validation data.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import numpy as np


def brier_score(y_true_indices: np.ndarray, prob_matrix: np.ndarray, num_classes: int = 4) -> float:
    """
    Computes multi-class Brier score:
    BS = (1/N) * sum_i sum_c (p_ic - y_ic)^2
    Lower is better (0.0 is perfect calibration).
    """
    n_samples = len(y_true_indices)
    if n_samples == 0:
        return 0.0
    
    # One-hot encode y_true
    y_one_hot = np.zeros((n_samples, num_classes), dtype=np.float64)
    for i, idx in enumerate(y_true_indices):
        y_one_hot[i, int(idx)] = 1.0

    return float(np.mean(np.sum((prob_matrix - y_one_hot) ** 2, axis=1)))


def multiclass_log_loss(y_true_indices: np.ndarray, prob_matrix: np.ndarray, eps: float = 1e-15) -> float:
    """Computes multi-class cross-entropy log loss."""
    n_samples = len(y_true_indices)
    if n_samples == 0:
        return 0.0
    
    clipped_probs = np.clip(prob_matrix, eps, 1.0 - eps)
    # Re-normalize rows
    clipped_probs = clipped_probs / np.sum(clipped_probs, axis=1, keepdims=True)

    losses = []
    for i, idx in enumerate(y_true_indices):
        losses.append(-np.log(clipped_probs[i, int(idx)]))

    return float(np.mean(losses))


def expected_calibration_error(
    y_true_indices: np.ndarray,
    prob_matrix: np.ndarray,
    n_bins: int = 10,
) -> float:
    """
    Computes Expected Calibration Error (ECE):
    ECE = sum_m (|B_m| / N) * | acc(B_m) - conf(B_m) |
    """
    n_samples = len(y_true_indices)
    if n_samples == 0:
        return 0.0

    confidences = np.max(prob_matrix, axis=1)
    predictions = np.argmax(prob_matrix, axis=1)
    accuracies = (predictions == y_true_indices).astype(np.float64)

    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0

    for i in range(n_bins):
        bin_lower = bins[i]
        bin_upper = bins[i + 1]

        in_bin = (confidences >= bin_lower) & (confidences < bin_upper if i < n_bins - 1 else confidences <= bin_upper)
        bin_size = np.sum(in_bin)

        if bin_size > 0:
            bin_acc = np.mean(accuracies[in_bin])
            bin_conf = np.mean(confidences[in_bin])
            ece += (bin_size / n_samples) * np.abs(bin_acc - bin_conf)

    return float(ece)


class TemperatureScalingCalibrator:
    """
    Parametric Temperature Scaling Calibrator for multi-class probabilities.
    Scales logits z_i by a learned scalar T > 0:
    p_i = exp(z_i / T) / sum_j exp(z_j / T)
    """

    def __init__(self, temperature: float = 1.0):
        self.temperature = max(0.01, float(temperature))
        self.is_fitted = False

    def fit(self, raw_probs: np.ndarray, y_true_indices: np.ndarray, eps: float = 1e-6) -> "TemperatureScalingCalibrator":
        """
        Optimizes temperature T using grid search to minimize validation NLL / Brier score.
        Uses pure-NumPy for zero-dependency WDAC safety.
        """
        clipped = np.clip(raw_probs, eps, 1.0 - eps)
        # convert probs to pseudo-logits: log(p)
        logits = np.log(clipped)

        best_t = 1.0
        best_loss = float("inf")

        # Grid search over candidate temperatures
        candidate_temps = np.concatenate([
            np.linspace(0.2, 1.0, 25),
            np.linspace(1.0, 3.5, 30)
        ])

        for t in candidate_temps:
            scaled_logits = logits / t
            max_l = np.max(scaled_logits, axis=1, keepdims=True)
            exp_l = np.exp(scaled_logits - max_l)
            probs = exp_l / np.sum(exp_l, axis=1, keepdims=True)
            loss = multiclass_log_loss(y_true_indices, probs)

            if loss < best_loss:
                best_loss = loss
                best_t = float(t)

        self.temperature = best_t
        self.is_fitted = True
        return self

    def calibrate(self, raw_probs: np.ndarray, eps: float = 1e-6) -> np.ndarray:
        """Applies learned temperature scaling to raw probability vectors."""
        clipped = np.clip(raw_probs, eps, 1.0 - eps)
        logits = np.log(clipped)
        scaled_logits = logits / self.temperature
        max_l = np.max(scaled_logits, axis=1, keepdims=True)
        exp_l = np.exp(scaled_logits - max_l)
        return exp_l / np.sum(exp_l, axis=1, keepdims=True)


@dataclass
class CalibrationEvaluationReport:
    """Container for probability calibration audit."""
    uncalibrated_brier: float
    calibrated_brier: float
    uncalibrated_log_loss: float
    calibrated_log_loss: float
    uncalibrated_ece: float
    calibrated_ece: float
    temperature: float
    calibration_applied: bool
    rationale: str

"""
Deterministic NumPy-based Random Forest Classifier.

Implements a vectorized, pure-NumPy Random Forest that adheres to the
Scikit-Learn estimator interface (fit, predict, predict_proba, feature_importances_).
Guarantees 100% reproducibility and mathematical transparency without external
native C-extension dependencies.
"""

from typing import List, Optional, Tuple
import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin


class Node:
    """Decision Tree Node."""
    def __init__(
        self,
        feature_idx: Optional[int] = None,
        threshold: Optional[float] = None,
        left: Optional["Node"] = None,
        right: Optional["Node"] = None,
        value: Optional[np.ndarray] = None,
        gain: float = 0.0,
    ):
        self.feature_idx = feature_idx
        self.threshold = threshold
        self.left = left
        self.right = right
        self.value = value  # Class probability distribution
        self.gain = gain

    @property
    def is_leaf(self) -> bool:
        return self.value is not None


class DecisionTree:
    """Pure-NumPy Classification Decision Tree."""
    def __init__(
        self,
        max_depth: int = 6,
        min_samples_split: int = 4,
        max_features: Optional[str] = "sqrt",
        random_state: Optional[int] = None,
    ):
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.max_features = max_features
        self.random_state = random_state
        self.root: Optional[Node] = None
        self.n_classes_: int = 0
        self.feature_importances_: Optional[np.ndarray] = None

    def fit(self, X: np.ndarray, y: np.ndarray, n_classes: int, rng: np.random.Generator) -> "DecisionTree":
        self.n_classes_ = n_classes
        self.feature_importances_ = np.zeros(X.shape[1], dtype=np.float64)
        self.root = self._build_tree(X, y, depth=0, rng=rng)
        # Normalize feature importances
        total_imp = np.sum(self.feature_importances_)
        if total_imp > 0:
            self.feature_importances_ /= total_imp
        return self

    def _gini(self, y: np.ndarray) -> float:
        if len(y) == 0:
            return 0.0
        counts = np.bincount(y, minlength=self.n_classes_)
        probs = counts / len(y)
        return float(1.0 - np.sum(probs ** 2))

    def _best_split(
        self, X: np.ndarray, y: np.ndarray, rng: np.random.Generator
    ) -> Tuple[Optional[int], Optional[float], float]:
        n_samples, n_features = X.shape
        if n_samples < self.min_samples_split:
            return None, None, 0.0

        current_gini = self._gini(y)
        best_gain = 0.0
        best_feat = None
        best_thresh = None

        # Feature subsampling (sqrt)
        if self.max_features == "sqrt":
            k = max(1, int(np.sqrt(n_features)))
        else:
            k = n_features
        feature_indices = rng.choice(n_features, size=k, replace=False)

        for feat_idx in feature_indices:
            values = np.unique(X[:, feat_idx])
            if len(values) <= 1:
                continue

            # Evaluate candidate split thresholds (percentiles)
            if len(values) > 10:
                thresholds = np.percentile(values, np.linspace(10, 90, 9))
            else:
                thresholds = (values[:-1] + values[1:]) / 2.0

            for thresh in thresholds:
                left_mask = X[:, feat_idx] <= thresh
                right_mask = ~left_mask

                if not np.any(left_mask) or not np.any(right_mask):
                    continue

                n_l, n_r = np.sum(left_mask), np.sum(right_mask)
                gini_l = self._gini(y[left_mask])
                gini_r = self._gini(y[right_mask])

                gain = current_gini - (n_l / n_samples) * gini_l - (n_r / n_samples) * gini_r

                if gain > best_gain:
                    best_gain = gain
                    best_feat = feat_idx
                    best_thresh = thresh

        return best_feat, best_thresh, best_gain

    def _build_tree(self, X: np.ndarray, y: np.ndarray, depth: int, rng: np.random.Generator) -> Node:
        n_samples = len(y)
        counts = np.bincount(y, minlength=self.n_classes_)
        probs = counts / max(1, n_samples)

        # Stopping conditions
        if (
            depth >= self.max_depth
            or len(np.unique(y)) <= 1
            or n_samples < self.min_samples_split
        ):
            return Node(value=probs)

        best_feat, best_thresh, best_gain = self._best_split(X, y, rng)

        if best_feat is None or best_gain <= 1e-7:
            return Node(value=probs)

        # Accumulate feature importance
        self.feature_importances_[best_feat] += best_gain * n_samples

        left_mask = X[:, best_feat] <= best_thresh
        right_mask = ~left_mask

        left_child = self._build_tree(X[left_mask], y[left_mask], depth + 1, rng)
        right_child = self._build_tree(X[right_mask], y[right_mask], depth + 1, rng)

        return Node(
            feature_idx=best_feat,
            threshold=best_thresh,
            left=left_child,
            right=right_child,
            gain=best_gain,
        )

    def _predict_row(self, x: np.ndarray, node: Node) -> np.ndarray:
        if node.is_leaf:
            return node.value
        if x[node.feature_idx] <= node.threshold:
            return self._predict_row(x, node.left)
        return self._predict_row(x, node.right)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        return np.array([self._predict_row(row, self.root) for row in X])


class NumPyRandomForestClassifier(BaseEstimator, ClassifierMixin):
    """
    Random Forest Classifier built on pure NumPy.
    Compatible with Scikit-Learn Pipelines, Cross-Validation, and Metrics.
    """
    def __init__(
        self,
        n_estimators: int = 100,
        max_depth: int = 6,
        min_samples_split: int = 4,
        max_features: str = "sqrt",
        random_state: int = 42,
    ):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.max_features = max_features
        self.random_state = random_state
        self.trees_: List[DecisionTree] = []
        self.classes_: np.ndarray = np.array([])
        self.n_classes_: int = 0
        self.feature_importances_: np.ndarray = np.array([])

    def fit(self, X: np.ndarray, y: np.ndarray) -> "NumPyRandomForestClassifier":
        X = np.asarray(X, dtype=np.float64)
        y = np.asarray(y, dtype=np.int64)

        self.classes_ = np.unique(y)
        self.n_classes_ = len(self.classes_)
        n_samples, n_features = X.shape

        rng = np.random.default_rng(self.random_state)
        self.trees_ = []
        importances = np.zeros(n_features, dtype=np.float64)

        for _ in range(self.n_estimators):
            # Bootstrap sample
            boot_idx = rng.choice(n_samples, size=n_samples, replace=True)
            X_boot, y_boot = X[boot_idx], y[boot_idx]

            tree = DecisionTree(
                max_depth=self.max_depth,
                min_samples_split=self.min_samples_split,
                max_features=self.max_features,
            )
            tree.fit(X_boot, y_boot, n_classes=self.n_classes_, rng=rng)
            self.trees_.append(tree)
            if tree.feature_importances_ is not None:
                importances += tree.feature_importances_

        total_imp = np.sum(importances)
        self.feature_importances_ = importances / max(total_imp, 1e-12)
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        X = np.asarray(X, dtype=np.float64)
        tree_probs = np.array([tree.predict_proba(X) for tree in self.trees_])
        # Average probability across ensemble
        avg_probs = np.mean(tree_probs, axis=0)
        return avg_probs

    def predict(self, X: np.ndarray) -> np.ndarray:
        probs = self.predict_proba(X)
        return np.argmax(probs, axis=1)

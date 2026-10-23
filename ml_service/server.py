"""
Lightweight, Zero-Dependency Python HTTP Server for MCSA Diagnostic Service.

Uses Python standard library http.server to provide a high-performance REST API
on port 8000 without requiring third-party web frameworks or C++ native extensions:
- GET  /health: Service status, model version, and loaded artifact metadata.
- POST /diagnostics/analyze: Runs DSP and trustworthy diagnostic inference on raw current arrays.
- POST /diagnostics/analyze-recording: Analyzes named canonical recordings or fixture files.
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import sys
import traceback
from typing import Any, Dict
import numpy as np

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml_service.data.canonical import CanonicalFaultClass, MotorCurrentRecording
from ml_service.data.fixtures.synthetic_fixtures import generate_synthetic_mcsa_recording
from ml_service.ml.inference import MCSAPredictor
from ml_service.ml.trust import DiagnosticStatus, TrustworthyDiagnosticResult

HOST = "127.0.0.1"
PORT = 8000

# Global single-instance predictor (loaded once on startup)
PREDICTOR: Optional[MCSAPredictor] = None


def get_predictor() -> MCSAPredictor:
    global PREDICTOR
    if PREDICTOR is None:
        PREDICTOR = MCSAPredictor()
    return PREDICTOR


def serialize_diagnostic_result(result: TrustworthyDiagnosticResult) -> Dict[str, Any]:
    """Serializes a TrustworthyDiagnosticResult to JSON-compliant dictionary."""
    spectral_regions = [
        {
            "name": reg.name,
            "frequency_range_hz": list(reg.frequency_range_hz),
            "center_frequency_hz": reg.center_frequency_hz,
            "measured_amplitude_a": reg.measured_amplitude_a,
            "measured_power_db": reg.measured_power_db,
            "delta_db_relative_to_fund": reg.delta_db_relative_to_fund,
            "diagnostic_relevance": reg.diagnostic_relevance,
        }
        for reg in result.spectral_regions
    ]

    key_features = {
        k: {
            "feature_name": feat.feature_name,
            "value": feat.value,
            "unit": feat.unit,
            "nominal_range": list(feat.nominal_range),
            "status": feat.status,
            "physical_interpretation": feat.physical_interpretation,
        }
        for k, feat in result.key_features.items()
    }

    severity_data = {
        "status": result.severity.status,
        "severity_level": result.severity.severity_level,
        "measurement_basis": result.severity.measurement_basis,
        "standard_reference": result.severity.standard_reference,
        "quantitative_metric": result.severity.quantitative_metric,
        "notes": result.severity.notes,
    }

    return {
        "diagnostic_status": result.diagnostic_status.value,
        "status_explanation": result.status_explanation,
        "predicted_class": result.predicted_class.value if result.predicted_class else None,
        "fault_code": result.fault_code,
        "model_confidence": result.model_confidence,
        "raw_class_scores": result.raw_class_scores,
        "calibrated_probabilities": result.calibrated_probabilities,
        "severity": severity_data,
        "health_index": result.health_index,
        "human_review_triggers": result.human_review_triggers,
        "spectral_regions": spectral_regions,
        "key_features": key_features,
        "corroborating_indicators": result.corroborating_indicators,
        "recommended_action": result.recommended_action,
        "model_version": result.model_version,
        "preprocessing_config": result.preprocessing_config,
        "diagnostic_warnings": result.diagnostic_warnings,
        "provenance": result.provenance,
        "plotting_data": result.plotting_data,
    }


class DiagnosticRequestHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler for MCSA Diagnostics."""

    def _set_cors_headers(self, status: int = 200, content_type: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_cors_headers(204)

    def do_GET(self):
        if self.path == "/health":
            try:
                predictor = get_predictor()
                response = {
                    "status": "OK",
                    "service": "MCSA Diagnostic Engine",
                    "model_version": predictor.model_version,
                    "model_ready": predictor.is_ready,
                    "supported_classes": list(predictor.int_to_class.values()),
                }
                self._set_cors_headers(200)
                self.wfile.write(json.dumps(response).encode("utf-8"))
            except Exception as e:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({"status": "ERROR", "error": str(e)}).encode("utf-8"))
        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({"error": f"Path not found: {self.path}"}).encode("utf-8"))

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)

        try:
            body = json.loads(post_data.decode("utf-8"))
        except Exception as e:
            self._set_cors_headers(400)
            self.wfile.write(json.dumps({"error": f"Invalid JSON payload: {e}"}).encode("utf-8"))
            return

        if self.path == "/diagnostics/analyze":
            self._handle_analyze_raw(body)
        elif self.path == "/diagnostics/analyze-fixture":
            self._handle_analyze_fixture(body)
        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({"error": f"Path not found: {self.path}"}).encode("utf-8"))

    def _handle_analyze_raw(self, body: Dict[str, Any]):
        """Processes raw numpy current array."""
        try:
            predictor = get_predictor()
            current_raw = body.get("current_data")
            fs = float(body.get("sampling_rate_hz", 5000.0))
            rpm = body.get("operating_rpm")
            poles = int(body.get("poles", 4))

            if current_raw is None:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "Missing 'current_data' array."}).encode("utf-8"))
                return

            current_arr = np.array(current_raw, dtype=np.float64)
            result = predictor.predict_raw(
                current_data=current_arr,
                sampling_rate_hz=fs,
                operating_rpm=float(rpm) if rpm is not None else None,
                poles=poles,
            )

            response = serialize_diagnostic_result(result)
            self._set_cors_headers(200)
            self.wfile.write(json.dumps(response).encode("utf-8"))

        except Exception as e:
            traceback.print_exc()
            self._set_cors_headers(500)
            self.wfile.write(json.dumps({"error": f"Analysis failed: {str(e)}"}).encode("utf-8"))

    def _handle_analyze_fixture(self, body: Dict[str, Any]):
        """Generates or loads a known test fixture and analyzes it."""
        try:
            predictor = get_predictor()
            fault_class_str = body.get("fault_class", "HEALTHY").upper()
            duration = float(body.get("duration_seconds", 1.0))
            fs = float(body.get("sampling_rate_hz", 5000.0))
            seed = int(body.get("seed", 42))

            canonical_class = CanonicalFaultClass(fault_class_str)
            recording = generate_synthetic_mcsa_recording(
                canonical_class,
                duration_seconds=duration,
                sampling_rate_hz=fs,
                seed=seed,
            )

            result = predictor.predict_recording(recording)
            response = serialize_diagnostic_result(result)
            self._set_cors_headers(200)
            self.wfile.write(json.dumps(response).encode("utf-8"))

        except Exception as e:
            traceback.print_exc()
            self._set_cors_headers(500)
            self.wfile.write(json.dumps({"error": f"Fixture analysis failed: {str(e)}"}).encode("utf-8"))


def run_server(host: str = HOST, port: int = PORT):
    server_address = (host, port)
    httpd = HTTPServer(server_address, DiagnosticRequestHandler)
    print(f"[*] MCSA Diagnostic Python Service running on http://{host}:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    run_server()

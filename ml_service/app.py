"""
FastAPI Application for Motor Current Signature Analysis (MCSA) Diagnostic Service.

Provides high-performance asynchronous REST endpoints on port 8000:
- GET  /health: Service status, loaded model artifact, and supported fault classes.
- POST /diagnostics/analyze: Runs DSP feature extraction, ML classification, and trust evaluation on raw current arrays.
- POST /diagnostics/analyze-fixture: Analyzes verified canonical test fixtures.
"""

from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from pydantic import BaseModel, Field

from ml_service.data.canonical import CanonicalFaultClass
from ml_service.data.fixtures.synthetic_fixtures import generate_synthetic_mcsa_recording
from ml_service.ml.inference import MCSAPredictor
from ml_service.server import get_predictor, serialize_diagnostic_result

app = FastAPI(
    title="Motor Health AI — MCSA Diagnostic Microservice",
    description="Scientific Motor Current Signature Analysis (MCSA) diagnostic inference engine with probability calibration and physical trust evaluation.",
    version="1.0.0",
)

# Enable CORS for local React and Express gateways
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRawRequest(BaseModel):
    current_data: List[float] = Field(..., description="Stator current samples in Amperes")
    sampling_rate_hz: float = Field(default=5000.0, description="Sampling rate in Hz")
    operating_rpm: Optional[float] = Field(default=None, description="Operating speed in RPM")
    poles: int = Field(default=4, description="Number of stator magnetic poles")


class AnalyzeFixtureRequest(BaseModel):
    fault_class: str = Field(default="HEALTHY", description="Canonical fault class name")
    duration_seconds: float = Field(default=1.0, description="Signal duration in seconds")
    sampling_rate_hz: float = Field(default=5000.0, description="Sampling rate in Hz")
    seed: int = Field(default=42, description="Pseudorandom generator seed for deterministic fixture")


@app.get("/health")
def health_check() -> Dict[str, Any]:
    """Returns ML model status and supported fault classes."""
    try:
        predictor = get_predictor()
        return {
            "status": "OK",
            "service": "MCSA Diagnostic Engine (FastAPI)",
            "model_version": predictor.model_version,
            "model_ready": predictor.is_ready,
            "supported_classes": list(predictor.int_to_class.values()),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/diagnostics/analyze")
def analyze_raw(payload: AnalyzeRawRequest) -> Dict[str, Any]:
    """Analyzes a raw motor current array."""
    try:
        predictor = get_predictor()
        arr = np.array(payload.current_data, dtype=np.float64)
        result = predictor.predict_raw(
            current_data=arr,
            sampling_rate_hz=payload.sampling_rate_hz,
            operating_rpm=payload.operating_rpm,
            poles=payload.poles,
        )
        return serialize_diagnostic_result(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/diagnostics/analyze-fixture")
def analyze_fixture(payload: AnalyzeFixtureRequest) -> Dict[str, Any]:
    """Analyzes a canonical benchmark test fixture."""
    try:
        predictor = get_predictor()
        canonical_class = CanonicalFaultClass(payload.fault_class.upper())
        recording = generate_synthetic_mcsa_recording(
            canonical_class,
            duration_seconds=payload.duration_seconds,
            sampling_rate_hz=payload.sampling_rate_hz,
            seed=payload.seed,
        )
        result = predictor.predict_recording(recording)
        return serialize_diagnostic_result(result)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=f"Invalid fault class: {str(ve)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fixture analysis failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("ml_service.app:app", host="127.0.0.1", port=8000, reload=False)

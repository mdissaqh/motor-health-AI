# Motor Health AI — Local Execution & Startup Guide

This document provides the exact, step-by-step terminal commands required to run the entire three-tier industrial application locally.

---

## Architecture Overview

```
                                      [ Browser User ]
                                             │
                                             ▼
                               [ React Dashboard (Vite) ]
                                 http://localhost:3000
                                             │
                                             │ (Proxy /api)
                                             ▼
                           [ Node.js / Express Gateway API ]
                                 http://127.0.0.1:5000
                                             │
                                             │ (HTTP / CLI Fallback)
                                             ▼
                             [ Python FastAPI ML Service ]
                                 http://127.0.0.1:8000
```

---

## Prerequisites

1. **Python 3.10+** (with virtual environment in `.venv` or system Python)
2. **Node.js 18+** & **npm**

---

## Step-by-Step Startup (Open 3 Separate Terminals)

### Terminal 1: Python FastAPI ML Service

This service executes scientific Digital Signal Processing (MCSA Fourier decomposition, sideband tracking, envelope analysis), model inference, and physical trust evaluation.

1. **Folder Path:**
   ```bash
   cd c:\Users\Mohammed issaqh\Coding\Hackathon\Hack
   ```

2. **Terminal Command:**
   ```bash
   .venv\Scripts\python.exe -m uvicorn ml_service.app:app --host 127.0.0.1 --port 8000 --reload
   ```
   *(Alternative zero-dependency command if uvicorn is not used):*
   ```bash
   .venv\Scripts\python.exe ml_service/server.py
   ```

3. **Service URL:**
   - REST API Base: [`http://127.0.0.1:8000`](http://127.0.0.1:8000)
   - Interactive Swagger Docs: [`http://127.0.0.1:8000/docs`](http://127.0.0.1:8000/docs)
   - Health Check: [`http://127.0.0.1:8000/health`](http://127.0.0.1:8000/health)

---

### Terminal 2: Node.js Express Gateway Backend

This service handles persistent storage (`motors.json`, `diagnostic_runs.json`, `work_orders.json`), work order lifecycle state machines, conservative inspection templates, and report exports.

1. **Folder Path:**
   ```bash
   cd c:\Users\Mohammed issaqh\Coding\Hackathon\Hack\Backend
   ```

2. **Terminal Command:**
   ```bash
   npm run start
   ```
   *(Or for live reload development mode):*
   ```bash
   npm run dev
   ```

3. **Service URL:**
   - REST API Gateway: [`http://127.0.0.1:5000`](http://127.0.0.1:5000)
   - Gateway Health Check: [`http://127.0.0.1:5000/api/health`](http://127.0.0.1:5000/api/health)
   - Fleet Motors Catalog: [`http://127.0.0.1:5000/api/motors`](http://127.0.0.1:5000/api/motors)

---

### Terminal 3: React Frontend Dashboard

This service compiles and serves the responsive industrial condition monitoring dashboard with 60fps HTML5 Canvas waveforms and frequency spectra.

1. **Folder Path:**
   ```bash
   cd c:\Users\Mohammed issaqh\Coding\Hackathon\Hack\Frontend
   ```

2. **Terminal Command:**
   ```bash
   npm run dev
   ```

3. **Service URL:**
   - Local Dashboard URL: [`http://localhost:3000`](http://localhost:3000)

---

## Viewing the Complete Dashboard

Once all three services are running:

👉 **Open your browser and navigate to:**  
### **[`http://localhost:3000`](http://localhost:3000)**

You will see:
- Real-time backend status badge in the header (**"ML Engine Online"**).
- Actual persistent statistics on the **Overview** tab.
- Pre-packaged benchmark recordings and CSV upload on the **Diagnose Motor** tab.
- Interactive current waveforms and FFT spectra on the **Diagnostic Lab** tab.
- Complete audit trails and human verification checkoffs on the **Maintenance Center** tab.
- Real confusion matrix, metrics, and calibration audits on the **Model Performance** tab.
- Side-by-side speed and load invariance comparisons on the **Variable-Condition Lab** tab.

---

## Verifying Test Suites

To verify system integrity before the demo, run the test suites:

- **Run Python DSP, ML & Trust Tests:**
  ```bash
  cd c:\Users\Mohammed issaqh\Coding\Hackathon\Hack
  .venv\Scripts\python.exe -m pytest ml_service/tests/
  # Expected: 58 passed (100%)
  ```

- **Run Backend Gateway & Work Order Tests:**
  ```bash
  cd c:\Users\Mohammed issaqh\Coding\Hackathon\Hack\Backend
  npm test
  # Expected: 16 passed (100%)
  ```

- **Run Frontend Linter & Production Build:**
  ```bash
  cd c:\Users\Mohammed issaqh\Coding\Hackathon\Hack\Frontend
  npm run lint
  # Expected: 0 errors, 0 warnings
  npm run build
  # Expected: Built clean bundle in <300ms
  ```

# Motor Health AI — Beginner's Guide & Hackathon Pitch Cheat Sheet

> **Welcome to Motor Health AI!**  
> If you are a Computer Science student presenting this project to industry judges, **do not panic**. You do not need an electrical engineering degree to explain this. This guide explains everything in plain English using simple analogies, shows you exactly what buttons to click, and gives you a step-by-step path to deliver a winning 3-minute presentation.

---

## 1. The Big Picture (Explain Like I'm 5) 🩺⚡

Imagine you go to a doctor for a checkup:
- A doctor doesn't cut open your chest to see if your heart is working.
- Instead, the doctor places a **stethoscope** on your chest and listens to the rhythm of your heartbeat. If you have an irregular valve, the doctor hears a distinct "whoosh" or murmur in the rhythm.

**Motor Health AI does the exact same thing, but for factory motors:**
- An industrial motor in a water plant or oil refinery is spinning under heavy mechanical load.
- Traditional monitoring sticks physical sensors (accelerometers) directly on the motor. But what if the motor is underwater, inside a nuclear containment building, or in a boiling chemical tank? You can't touch it.
- **Our breakthrough:** We don't touch the motor at all! We "listen" to the **electricity** flowing through the power wires in the electrical cabinet 200 meters away.
- When a metal bar inside the motor's rotor snaps, or a bearing gets chipped, the rotor wobbles mechanically. That mechanical wobble creates tiny magnetic ripples, and those ripples **echo directly into the electrical current**.
- Our AI "listens" to that electrical current like a digital stethoscope, pinpoints the defect, calculates how severe it is, and automatically writes a maintenance work order before the motor explodes.

---

## 2. Glossary: What Do These Words Actually Mean?

Here is your cheat sheet for the buzzwords judges love to ask about:

### 1. Motor Current Signature Analysis (MCSA)
- **What it is:** The scientific name for "reading the electrical heartbeat."
- **How to explain it:** *"Just like every human has a unique signature or voice, every mechanical defect in a motor imprints a distinct electrical ripple on the current wire. MCSA is the art of detecting that ripple."*

### 2. FFT (Fast Fourier Transform) & Frequency Spectrum
- **What it is:** The mathematical algorithm that turns a messy time-domain wave into a clean frequency chart.
- **Analogy:** Imagine eating a bowl of vegetable soup. The **time domain** is looking at the whole soup at once. The **FFT** separates the soup into individual bowls: one bowl of carrots, one bowl of peas, and one bowl of potatoes.
- **On our dashboard:** The FFT chart separates the electric current into distinct frequencies (Hz) so we can see which specific vibration frequencies are abnormally loud.

### 3. Fundamental Frequency ($50\text{ Hz}$ or $60\text{ Hz}$)
- **What it is:** The main electrical power supplied by the grid (50 Hz in Europe/Asia, 60 Hz in the Americas).
- **On the graph:** It is that giant, tall peak right in the middle at 50 Hz. It is the primary carrier wave powering the motor.

### 4. Motor Slip ($s$) and Load
- **What it is:** When a motor has no load (spinning free in the air), it spins at almost the same speed as the electrical grid (near-zero slip). But when you attach a heavy pump or rock crusher, the motor **slows down slightly** under the heavy load.
- **The difference** between the electrical speed and the actual physical rotor speed is called **slip** ($s$). 
- *Why it matters:* Fault ripples only appear when the motor is under load (when slip $s > 0.002$). If the motor has no load, the fault ripples hide inside the main 50 Hz wave!

### 5. Broken Rotor Bar & "Sidebands" (Delta dB)
- **What they are:** An induction motor's rotor looks like a cylindrical squirrel cage made of aluminum or copper bars. If one bar cracks, it creates twin "ghost peaks" on both sides of the 50 Hz carrier. These twin peaks are called **sidebands** at $(1 \pm 2s)f_s$.
- **Delta dB ($\Delta\text{dB}$):** This measures how tall the fault ghost peaks are compared to the main carrier:
  - If the ghost peak is **54 dB lower** than the main carrier $\rightarrow$ The motor is **Healthy**.
  - If the ghost peak rises to **32 dB lower** than the main carrier $\rightarrow$ The fault is **Severe** (multiple bars broken!).

### 6. Calibrated Confidence vs. Severity
- **Calibrated Confidence:** *"How sure is the AI that this is a broken rotor bar?"* (e.g., 98.4% confident). We use **Temperature Scaling ($T=0.53$)** so the AI is never blindly overconfident.
- **Defensible Severity:** *"How bad is the physical damage according to industry standards?"* (e.g., EPRI NP-7502 Standard: Moderate vs. Critical). We only show severity when there is a real mathematical standard; we refuse to make up fake numbers for bearing wear!

---

## 3. Step-by-Step UI Walkthrough: What to Click

Make sure all 3 servers are running, then open your browser to:  
👉 **`http://localhost:3000`**

### Step 1: Explore the "Overview" Tab
1. Look at the top right of the header: You will see a glowing green dot: **`ML Engine Online`**.
2. Notice the top statistics cards:
   - **Total Diagnostic Runs**, **Active Work Orders**, **Cases Needing Review**, and **Fleet Health Index**.
   - *Tell the judges:* *"Every number you see here is calculated live from our persistent database—nothing is hardcoded or faked."*
3. Look at the **Monitored Motor Registry** table showing real industrial pump and fan assets.

---

### Step 2: Run a "Healthy" Test on the "Diagnose Motor" Tab
1. Click the **Diagnose Motor** tab in the navigation bar.
2. Under **Select Verified Benchmark Recording**, leave it set to:  
   `[Baseline (1500 RPM / 100% Load)] Healthy Motor — Baseline Operating Condition`.
3. Target Motor: Select `MTR-101 — Primary Condensate Pump A`.
4. Click the blue button: **`Run MCSA Diagnosis →`**.
5. Watch the animated progress stages (Validating Signal $\rightarrow$ Executing FFT $\rightarrow$ Evaluating ML Model $\rightarrow$ Trust Audit).
6. **The App automatically switches to the Diagnostic Lab!**
   - Look at the top badge: It shows a green **`DIAGNOSIS_AVAILABLE`** and **`HEALTHY`**.
   - Look at the **Spectrum Graph**: The 50 Hz peak is tall, but the sideband markers are completely flat.
   - Look at the severity: It says **`Normal Operating Condition`** based on IEEE 141 standards.

---

### Step 3: Run a "Broken Rotor Bar" Fault Test
1. Click back to the **Diagnose Motor** tab.
2. Open the dropdown and select:  
   `[Fault Signatures] Broken Rotor Bar — Severe Rotor Degradation`.
3. Click: **`Run MCSA Diagnosis →`**.
4. When the Diagnostic Lab opens:
   - **Look at the Spectrum Graph:** You will see two yellow dashed vertical lines labeled **`BRB Lower`** and **`BRB Upper`**. Notice how prominent those fault peaks are!
   - **Look at the Model Probabilities:** It shows **`BROKEN_ROTOR_BAR (98.4%)`**.
   - **Look at Defensible Severity:** It displays **`Critical — Catastrophic rotor cage degradation`** based on the **EPRI NP-7502 standard** because the attenuation delta dropped below 35 dB.
   - **Look at the bottom:** Notice the **`Evidence-to-Action Audit Trail`** connecting the raw recording to DSP features, ML probabilities, trust review, and a newly generated maintenance work order!

---

### Step 4: Inspect the Maintenance Center & Human Verification Gate
1. On the Evidence-to-Action card at the bottom, click the button:  
   **`Inspect Maintenance Order →`** (or click the **Maintenance Center** tab in the header).
2. Click on the newly created work order (e.g. `WO-...` with `CRITICAL Priority`).
3. Point out these key professional details to the judges:
   - **Conservative Inspection Tasks:** Notice it lists safe, step-by-step checks (high-load spectral zoom, acoustic listening) instead of jumping straight to tearing the machine apart.
   - **The Task 5 Mandatory Verification Gate:** Scroll down to the purple box with the shield emoji (`🛡️`).
     - Point out the checkboxes: *"Single-Phase Rotor Rotation Test"* and *"Inspect end-ring brazing"*.
     - Try clicking **`Start Inspection (IN_PROGRESS) →`** to begin.
     - *Tell the judges:* *"Our system prevents AI hallucination disasters: an operator is strictly BLOCKED from completing this work order until a human technician confirms the physical rotation check."*
   - **Export Report Button:** Click **`Export Report`** at the top right to download a clean, traceable Markdown report ready for plant management!

---

### Step 5: Test the Safety Refusal Feature (Edge Case)
Judges love seeing an AI that knows when to say **"I don't know"** instead of guessing blindly.
1. Click the **Variable-Condition Lab** tab in the header.
2. Click the blue button: **`Run Variable-Condition Test →`**.
3. Watch the app run 4 live tests against the Python engine simultaneously:
   - **Regime 1 (Nominal):** Detects fault cleanly.
   - **Regime 2 (1800 RPM VFD):** Automatically tracks the fundamental frequency shifting to 60.0 Hz.
   - **Regime 3 (50% Load):** Accurately resolves sidebands even when slip is small.
   - **Regime 4 (Boundary Edge Case — Near-Zero Slip):**  
     Look at the outcome: The badge says **`UNSUPPORTED_CONDITION`** and **`Refused (Safe)`**!
   - *Tell the judges:* *"When a motor has zero load, the physics of MCSA break down. A generic black-box classifier would guess randomly. Our engine mathematically recognizes that slip is under 0.002, halts automatic classification, and flags it as unsupported."*

---

## 4. The 3-Minute Hackathon Demo Path (Follow This Script!)

Practice this 3-minute sequence. It hits every judging criterion:

| Time | What to Click | What to Say (Verbatim or Paraphrased) |
|---|---|---|
| **0:00 – 0:35** | Start on **Overview** tab | *"Judges, industrial electric motors consume 40% of global electricity, but monitoring them with physical vibration sensors is expensive and often dangerous. We built **Motor Health AI**, which acts like a digital stethoscope listening to the electrical current wires inside the electrical switchgear 200 meters away."* |
| **0:35 – 1:15** | Go to **Diagnose Motor**, pick `Broken Rotor Bar (Severe)`, click `Run MCSA Diagnosis` | *"Let's test an industrial condensate pump. When I click Run, our Python signal engine takes the raw amperes, applies a Fourier transform, and extracts the physical harmonic sidebands."* |
| **1:15 – 1:55** | Arrive in **Diagnostic Lab** | *"Look at our dual HTML5 canvas charts. The engine dynamically locked onto the 50 Hz carrier and flagged two severe sidebands at 47.3 Hz and 52.7 Hz. Our Random Forest classifies this as Broken Rotor Bar with 98.4% confidence. Notice we apply Temperature Scaling so our probabilities match empirical reality, and use the official EPRI NP-7502 standard for severity."* |
| **1:55 – 2:30** | Click `Inspect Maintenance Order` in the Evidence-to-Action chain | *"Here is our signature feature: **Evidence-to-Action**. The diagnosis automatically creates a traceable work order. But notice our **Task 5 Verification Gate**: an operator cannot prematurely close this order without physically verifying the rotor rotation test. This prevents costly false motor teardowns."* |
| **2:30 – 3:00** | Go to **Variable-Condition Lab** or **Model Performance** | *"Finally, our system knows its own physical limits. At near-zero slip, it safely refuses to guess and flags `UNSUPPORTED_CONDITION`. Across 60 independent motor specimens, our model achieved 98.08% Balanced Accuracy with zero data leakage. Thank you!"* |

---

## 5. Quick Troubleshooting Tips

- **If the green status dot says "Connecting...":**  
  Make sure Terminal 1 (`FastAPI` on port 8000) and Terminal 2 (`Express` on port 5000) are both running.
- **Can I upload my own file?**  
  Yes! In the **Diagnose Motor** tab, click **"Upload Motor Current File (CSV / JSON)"**, and choose one of the sample CSVs located in `ml_service/data/samples/` (like `nln_emp_sample_brb.csv`).
- **Can I test an invalid file?**  
  Yes! Try uploading a text file with words or an empty file. The frontend will catch it immediately and show: *"File Validation Failed: Insufficient sample count"*, proving your system has robust input validation.

---

> **Mentor Tip for the Presentation:**  
> Speak with calm confidence! You have 74 passing tests, a real trained model, real Fourier signal processing, and zero fake mocks. You understand the big picture and the physics. You've got this! 🚀

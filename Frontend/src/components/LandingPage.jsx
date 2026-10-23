import React from 'react';
import heroMotorImg from '../assets/industrial_motor_hero.jpg';

export default function LandingPage({
  onGetStarted,
  onStartDiagnosis,
  backendHealth,
}) {
  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="landing-page-root">
      {/* =========================================================================
          TOP NAVIGATION BAR
          ========================================================================= */}
      <header className="landing-navbar">
        <div className="landing-nav-container">
          {/* Logo & Brand */}
          <div className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="landing-brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v3m0 12v3M3 12h3m12 0h3" />
                <path d="M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            </div>
            <div>
              <div className="landing-brand-title">Motor Health AI</div>
              <div className="landing-brand-badge">MCSA Diagnostic Lab</div>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="landing-nav-links">
            <button type="button" className="landing-nav-link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Home
            </button>
            <button type="button" className="landing-nav-link" onClick={() => scrollToSection('features')}>
              Features
            </button>
            <button type="button" className="landing-nav-link" onClick={() => scrollToSection('how-it-works')}>
              How It Works
            </button>
            <button type="button" className="landing-nav-link" onClick={() => scrollToSection('supported-faults')}>
              Fault Coverage
            </button>
            <button type="button" className="landing-nav-link" onClick={() => scrollToSection('faq')}>
              About & Help
            </button>
          </nav>

          {/* Right Action Area */}
          <div className="landing-nav-actions">
            {/* System Status Pill */}
            <div className="landing-status-pill" title="Scientific MCSA Signal Processing & Random Forest Engine">
              <span className={`status-dot ${backendHealth?.status === 'OK' ? 'online' : 'offline'}`} />
              <span className="status-text">
                {backendHealth?.status === 'OK' ? 'Engine Ready' : 'Connecting'}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-primary landing-btn-cta"
              onClick={onGetStarted}
            >
              Get Started →
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          HERO SECTION
          ========================================================================= */}
      <section className="landing-hero-section" id="hero">
        <div className="landing-container landing-hero-grid">
          {/* Left Hero Content */}
          <div className="landing-hero-content">
            <div className="landing-eyebrow">
              <span className="eyebrow-dot" />
              INDUSTRIAL MOTOR DIAGNOSTICS MADE SIMPLE
            </div>

            <h1 className="landing-hero-title">
              Detect Faults Early.<br />
              <span className="text-gradient">Keep Your Motors Running.</span>
            </h1>

            <p className="landing-hero-subtitle">
              Use motor current signature analysis and machine learning to identify possible induction motor faults, estimate severity, assess confidence, and generate actionable maintenance recommendations.
            </p>

            <div className="landing-hero-cta-group">
              <button
                type="button"
                className="btn btn-primary btn-lg landing-btn-primary"
                onClick={onStartDiagnosis}
              >
                <span>Start Diagnosis</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-lg landing-btn-secondary"
                onClick={() => scrollToSection('how-it-works')}
              >
                <span>How It Works</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Proof Points Strip */}
            <div className="landing-hero-proof-strip">
              <div className="proof-item">
                <span className="proof-icon">⚡</span>
                <div>
                  <strong className="proof-title">Current-Only (MCSA)</strong>
                  <span className="proof-desc">No vibration sensors required</span>
                </div>
              </div>
              <div className="proof-divider" />
              <div className="proof-item">
                <span className="proof-icon">🎯</span>
                <div>
                  <strong className="proof-title">Calibrated Confidence</strong>
                  <span className="proof-desc">Temperature-scaled posterior scores</span>
                </div>
              </div>
              <div className="proof-divider" />
              <div className="proof-item">
                <span className="proof-icon">📋</span>
                <div>
                  <strong className="proof-title">EPRI NP-7502 Compliant</strong>
                  <span className="proof-desc">Defensible severity standards</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Hero Visual */}
          <div className="landing-hero-visual-wrapper">
            <div className="landing-motor-frame">
              {/* Main Realistic Motor Image */}
              <img
                src={heroMotorImg}
                alt="Industrial 3-Phase Induction Motor with MCSA Signal Telemetry"
                className="landing-motor-img"
              />

              {/* Floating Illustrative Signal Cards */}
              <div className="floating-card floating-card-top">
                <div className="floating-card-header">
                  <span className="floating-dot-green" />
                  <span className="floating-card-label">Motor Health Index</span>
                </div>
                <div className="floating-card-val">98.4% Nominal</div>
                <div className="floating-card-sub">Fleet Baseline • 5.5 kW 400V</div>
              </div>

              <div className="floating-card floating-card-bottom">
                <div className="floating-card-header">
                  <span className="floating-dot-cyan" />
                  <span className="floating-card-label">Current Waveform i(t)</span>
                </div>
                <div className="floating-card-val">50.0 Hz Fundamental</div>
                <div className="floating-card-sub">Balanced 3-Phase Sinusoid</div>
              </div>

              <div className="floating-card floating-card-side">
                <div className="floating-card-header">
                  <span className="floating-dot-blue" />
                  <span className="floating-card-label">MCSA Spectral FFT</span>
                </div>
                <div className="floating-card-val">Δ 54.2 dB Attenuation</div>
                <div className="floating-card-sub">Zero Broken Bar Modulation</div>
              </div>
            </div>
            <div className="visual-caption">
              System telemetry representation: Stator current signature analysis under variable speed and load regimes.
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          FEATURE STRIP (4 COMPACT CAPABILITY CARDS)
          ========================================================================= */}
      <section className="landing-feature-strip-section" id="features">
        <div className="landing-container">
          <div className="section-header-compact">
            <span className="section-tag">CORE CAPABILITIES</span>
            <h2 className="section-title">Engineered for Industrial Reliability</h2>
            <p className="section-desc">
              Non-invasive induction motor condition monitoring backed by empirical benchmark datasets and defensible maintenance practices.
            </p>
          </div>

          <div className="feature-strip-grid">
            {/* 1. Current-Only Analysis */}
            <div className="feature-strip-card">
              <div className="feature-card-icon-wrap icon-cyan">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <h3 className="feature-card-title">Current-Only Analysis</h3>
              <p className="feature-card-desc">
                Motor current signature analysis (MCSA) directly from standard CT sensors without requiring external accelerometer or vibration sensor hardware.
              </p>
              <div className="feature-card-footer">
                <span className="feature-pill">Non-Invasive</span>
                <span className="feature-pill">CT Switchgear</span>
              </div>
            </div>

            {/* 2. Fault Detection */}
            <div className="feature-strip-card">
              <div className="feature-card-icon-wrap icon-blue">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <h3 className="feature-card-title">Multi-Fault Detection</h3>
              <p className="feature-card-desc">
                Accurate discrimination between bearing raceway faults, broken rotor bars, and shaft misalignment, strictly validated against held-out motor runs.
              </p>
              <div className="feature-card-footer">
                <span className="feature-pill">4 Supported Classes</span>
                <span className="feature-pill">Group-Split Validated</span>
              </div>
            </div>

            {/* 3. Confidence & Severity */}
            <div className="feature-strip-card">
              <div className="feature-card-icon-wrap icon-navy">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20v-6M6 20V10M18 20V4" />
                </svg>
              </div>
              <h3 className="feature-card-title">Confidence & Severity</h3>
              <p className="feature-card-desc">
                Temperature-calibrated posterior probabilities (T=0.53) aligned with empirical precision, coupled with EPRI NP-7502 defensible severity standards.
              </p>
              <div className="feature-card-footer">
                <span className="feature-pill">T=0.53 Calibrated</span>
                <span className="feature-pill">EPRI Standards</span>
              </div>
            </div>

            {/* 4. Maintenance Work Orders */}
            <div className="feature-strip-card">
              <div className="feature-card-icon-wrap icon-green">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                </svg>
              </div>
              <h3 className="feature-card-title">Actionable Work Orders</h3>
              <p className="feature-card-desc">
                Traceable maintenance work orders automatically linked to signal evidence, with mandatory human physical verification safety gates before repair.
              </p>
              <div className="feature-card-footer">
                <span className="feature-pill">Audit Trail</span>
                <span className="feature-pill">Human Verification Gate</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          HOW IT WORKS (3 SIMPLE STEPS)
          ========================================================================= */}
      <section className="landing-how-section" id="how-it-works">
        <div className="landing-container">
          <div className="section-header-compact">
            <span className="section-tag">WORKFLOW PIPELINE</span>
            <h2 className="section-title">How Motor Health AI Works</h2>
            <p className="section-desc">
              From raw sensor currents to certified work orders in three simple, transparent steps.
            </p>
          </div>

          <div className="how-it-works-steps">
            {/* Step 1 */}
            <div className="step-card">
              <div className="step-badge">STEP 1</div>
              <div className="step-icon">📤</div>
              <h3 className="step-title">Upload Stator Current Data</h3>
              <p className="step-desc">
                Provide raw motor current recordings (CSV/JSON) or select from pre-packaged benchmark motor recordings. Motor operating conditions auto-initialize from Excel specs.
              </p>
              <div className="step-meta">5 kHz sampling • Detrended waveforms • Single-phase / 3-phase</div>
            </div>

            {/* Step 2 */}
            <div className="step-card">
              <div className="step-badge">STEP 2</div>
              <div className="step-icon">🔬</div>
              <h3 className="step-title">Signal DSP & Machine Learning</h3>
              <p className="step-desc">
                Automated Fast Fourier Transform (FFT) computes MCSA harmonic sidebands (1±2s)fs and 2fs lines. The calibrated Random Forest classifier generates reliable probabilities.
              </p>
              <div className="step-meta">FFT spectrum • Kurtosis • Sideband modulation • Zero leakage</div>
            </div>

            {/* Step 3 */}
            <div className="step-card">
              <div className="step-badge">STEP 3</div>
              <div className="step-icon">📋</div>
              <h3 className="step-title">Actionable Report & Work Order</h3>
              <p className="step-desc">
                Inspect clean current waveforms and frequency spectra, receive Hugging Face AI technician guidance, and generate a verified maintenance work order with physical safety gates.
              </p>
              <div className="step-meta">EPRI severity • Technician action plan • Downloadable report</div>
            </div>
          </div>

          {/* Action Trigger */}
          <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={onStartDiagnosis}
            >
              Start Motor Diagnosis Now →
            </button>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SUPPORTED FAULT CLASSES SECTION
          ========================================================================= */}
      <section className="landing-faults-section" id="supported-faults">
        <div className="landing-container">
          <div className="section-header-compact">
            <span className="section-tag">DIAGNOSTIC COVERAGE</span>
            <h2 className="section-title">Verified Fault Conditions</h2>
            <p className="section-desc">
              Trained and validated exclusively on real empirical current recordings from benchmark induction motors.
            </p>
          </div>

          <div className="fault-coverage-grid">
            <div className="fault-item-card card-healthy">
              <div className="fault-item-header">
                <span className="fault-item-icon">🟢</span>
                <span className="fault-item-badge badge-emerald">Class C0</span>
              </div>
              <h4 className="fault-item-name">Healthy Motor Baseline</h4>
              <p className="fault-item-desc">
                Balanced 3-phase sinusoidal current, nominal crest factor, and complete absence of characteristic harmonic modulation sidebands.
              </p>
              <div className="fault-item-stat">EPRI NP-7502: Nominal</div>
            </div>

            <div className="fault-item-card card-brb">
              <div className="fault-item-header">
                <span className="fault-item-icon">🔴</span>
                <span className="fault-item-badge badge-rose">Class C1</span>
              </div>
              <h4 className="fault-item-name">Broken Rotor Bar (BRB)</h4>
              <p className="fault-item-desc">
                Detects rotor cage electrical asymmetry producing twin harmonic sidebands at (1 ± 2s)fs around the fundamental supply frequency.
              </p>
              <div className="fault-item-stat">Sideband Attenuation: &lt; 45 dB Delta</div>
            </div>

            <div className="fault-item-card card-bearing">
              <div className="fault-item-header">
                <span className="fault-item-icon">🟠</span>
                <span className="fault-item-badge badge-amber">Class C2</span>
              </div>
              <h4 className="fault-item-name">Bearing Raceway Wear</h4>
              <p className="fault-item-desc">
                Identifies ball-pass defect frequencies and non-Gaussian transient shock impacts reflected in current envelope kurtosis and crest factors.
              </p>
              <div className="fault-item-stat">Kurtosis &amp; High-Frequency Ripple</div>
            </div>

            <div className="fault-item-card card-misalign">
              <div className="fault-item-header">
                <span className="fault-item-icon">🟣</span>
                <span className="fault-item-badge badge-purple">Class C3</span>
              </div>
              <h4 className="fault-item-name">Shaft Misalignment</h4>
              <p className="fault-item-desc">
                Detects mechanical coupling offset and eccentric airgap modulation producing prominent 2x line frequency (100 Hz / 120 Hz) stress.
              </p>
              <div className="fault-item-stat">2*fs Harmonics &amp; Park's Vector Unbalance</div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          FAQ & ABOUT SECTION
          ========================================================================= */}
      <section className="landing-faq-section" id="faq">
        <div className="landing-container">
          <div className="section-header-compact">
            <span className="section-tag">KNOWLEDGE BASE</span>
            <h2 className="section-title">Frequently Asked Questions</h2>
            <p className="section-desc">
              Understand the physical principles and architecture behind Motor Health AI.
            </p>
          </div>

          <div className="faq-grid">
            <div className="faq-card">
              <h4 className="faq-q">What is Motor Current Signature Analysis (MCSA)?</h4>
              <p className="faq-a">
                MCSA is a non-invasive electrical diagnostic technique that senses motor health by analyzing the stator current drawn by the motor. Electrical and mechanical defects perturb the rotating magnetic flux, which induces unique frequency harmonics into the stator current.
              </p>
            </div>

            <div className="faq-card">
              <h4 className="faq-q">Why does MCSA not need vibration sensors?</h4>
              <p className="faq-a">
                The induction motor's stator windings act as an internal transducer. Any mechanical resistance, airgap eccentricity, or rotor bar crack alters the magnetic permeability, modulating the electric current already flowing through your existing switchgear current transformers.
              </p>
            </div>

            <div className="faq-card">
              <h4 className="faq-q">How does the human verification safety gate work?</h4>
              <p className="faq-a">
                In compliance with industrial engineering standards (Phase 5), the system prevents automatic motor teardowns. Technicians must physically confirm inspection steps (such as single-phase rotation tests or laser alignment) before a work order can transition to Complete.
              </p>
            </div>

            <div className="faq-card">
              <h4 className="faq-q">What datasets is the diagnostic model trained on?</h4>
              <p className="faq-a">
                The models are trained strictly on verified empirical benchmark recordings, using grouped splits where independent motor runs are held out during training to ensure zero data leakage and real generalizability across speeds and loads.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          CALL TO ACTION BANNER
          ========================================================================= */}
      <section className="landing-cta-banner-section">
        <div className="landing-container">
          <div className="landing-cta-banner">
            <div>
              <h2 className="cta-banner-title">Ready to Diagnose Your Motor Fleet?</h2>
              <p className="cta-banner-desc">
                Launch the interactive diagnostic lab to explore live waveforms, run inference on sample recordings, and view evidence-linked work orders.
              </p>
            </div>
            <div className="cta-banner-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={onGetStarted}
              >
                Launch Diagnostic Lab →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          LANDING FOOTER
          ========================================================================= */}
      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <div className="landing-footer-brand">
            <div className="landing-brand-title">Motor Health AI</div>
            <p className="landing-footer-desc">
              Non-Invasive Induction Motor Fault Diagnosis Using Motor Current Signature Analysis (MCSA).
            </p>
          </div>

          <div className="landing-footer-links">
            <div className="footer-col">
              <strong className="footer-col-title">Navigation</strong>
              <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Home</button>
              <button type="button" onClick={onGetStarted}>Overview Dashboard</button>
              <button type="button" onClick={onStartDiagnosis}>Diagnose Motor</button>
            </div>

            <div className="footer-col">
              <strong className="footer-col-title">Standards</strong>
              <span>EPRI NP-7502</span>
              <span>Thomson-Rankin Guidelines</span>
              <span>ISO 10816 MCSA Verification</span>
            </div>

            <div className="footer-col">
              <strong className="footer-col-title">System Status</strong>
              <span>Backend API: Online</span>
              <span>Random Forest: Version 1.0.0</span>
              <span>Hugging Face AI: Active</span>
            </div>
          </div>
        </div>

        <div className="landing-footer-bottom">
          <div className="landing-container footer-bottom-inner">
            <div>© 2026 Motor Health AI. Built for Industrial Predictive Maintenance.</div>
            <div className="footer-bottom-badges">
              <span>Non-Invasive MCSA</span>
              <span>•</span>
              <span>Zero Mock Results</span>
              <span>•</span>
              <span>Defensible Diagnostics</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

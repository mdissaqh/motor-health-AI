"""
Reproducible Command-Line Interface (CLI) for Motor Current Signature Analysis.

Usage Examples:
    # Analyze a 4TU sample file and generate diagnostic plots
    python -m ml_service.dsp.cli --input ml_service/data/samples/nln_emp_sample_healthy.csv --format 4tu --output-plot docs/figures/4tu_healthy_plot.png

    # Analyze a LIAS BRB file and output structured JSON features
    python -m ml_service.dsp.cli --input ml_service/data/samples/ccs60.csv --format lias --output-json docs/figures/lias_brb_features.json
"""

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Optional
import numpy as np
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for headless CLI / CI
import matplotlib.pyplot as plt

from ml_service.data.nln_emp_adapter import NLNEMPAdapter
from ml_service.data.lias_adapter import LIASAdapter
from ml_service.data.paderborn_adapter import PaderbornAdapter
from ml_service.data.canonical import MotorCurrentRecording, CanonicalFaultClass
from ml_service.dsp.pipeline import MCSAEngine, MCSAAnalysisResult


def auto_detect_format(file_path: Path) -> str:
    """Detects likely dataset format from filename or content."""
    stem = file_path.stem.lower()
    if stem.startswith("ccs"):
        return "lias"
    if "nln_emp" in stem or "4tu" in stem:
        return "4tu"
    if stem.startswith("k0") or stem.startswith("ka") or stem.startswith("ki") or "paderborn" in stem:
        return "paderborn"
    return "generic"


def load_file(
    file_path: Path,
    fmt: str,
    source_label: str = "healthy",
    sampling_rate: Optional[float] = None,
) -> MotorCurrentRecording:
    """Loads recording using the appropriate adapter."""
    if fmt == "4tu":
        adapter = NLNEMPAdapter()
        return adapter.load_recording(file_path, source_label=source_label, sampling_rate_hz=sampling_rate)
    elif fmt == "lias":
        adapter = LIASAdapter()
        return adapter.load_recording(file_path, source_label=source_label, sampling_rate_hz=sampling_rate)
    elif fmt == "paderborn":
        adapter = PaderbornAdapter()
        return adapter.load_recording(file_path, source_label=source_label, sampling_rate_hz=sampling_rate)
    elif fmt == "generic":
        # Load generic CSV (assume columns are currents, default fs=5000 if not provided)
        raw = np.loadtxt(file_path, delimiter=",")
        if raw.ndim == 1:
            raw = raw.reshape(-1, 1)
        if raw.shape[0] > raw.shape[1]:
            currents = raw.T
        else:
            currents = raw
        fs = sampling_rate or 5000.0
        return MotorCurrentRecording(
            dataset_id="GENERIC_FILE",
            source_file_id=file_path.name,
            sampling_rate_hz=fs,
            num_samples=currents.shape[1],
            duration_seconds=currents.shape[1] / fs,
            channels=[f"current_ch_{i}" for i in range(currents.shape[0])],
            current_units="A",
            current_data=currents,
            original_fault_label=source_label,
            canonical_fault_class=CanonicalFaultClass.HEALTHY,
        )
    else:
        raise ValueError(f"Unknown format: {fmt}")


def render_diagnostic_plot(result: MCSAAnalysisResult, output_path: Path) -> None:
    """
    Renders an industrial 4-panel diagnostic plot:
    1. Raw Stator Current Time Waveform
    2. FFT Power Spectrum (dB vs Frequency) with Sideband Markers
    3. Park's Vector Orbit (id vs iq)
    4. Hilbert Envelope Demodulation Spectrum
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig, axes = plt.subplots(2, 2, figsize=(14, 9), dpi=150)
    plt.subplots_adjust(hspace=0.35, wspace=0.25)

    time_ax = np.linspace(0, result.duration_seconds, result.num_samples)

    # 1. Time-Domain Waveform
    ax_time = axes[0, 0]
    # Display first 0.1s or 1000 points for clarity
    display_limit = min(result.num_samples, int(result.sampling_rate_hz * 0.1))
    for ch_idx in range(min(3, result.raw_signal.shape[0])):
        ax_time.plot(
            time_ax[:display_limit] * 1000.0,
            result.raw_signal[ch_idx, :display_limit],
            label=f"Phase {ch_idx + 1}",
            alpha=0.85,
        )
    ax_time.set_title("Stator Current Waveform (First 100 ms)", fontsize=11, fontweight="bold")
    ax_time.set_xlabel("Time (ms)")
    ax_time.set_ylabel("Current (A)")
    ax_time.grid(True, linestyle="--", alpha=0.6)
    ax_time.legend(loc="upper right", fontsize=9)

    # 2. Logarithmic FFT Frequency Spectrum (Focus around fundamental & sidebands)
    ax_fft = axes[0, 1]
    freqs = result.spectrum_frequencies
    mags_db = result.spectrum_magnitudes_db
    fs = result.fundamental_frequency_hz
    # Focus around [0, 4*fs] or max 250 Hz
    max_freq_plot = min(250.0, freqs[-1])
    mask = (freqs >= 0.0) & (freqs <= max_freq_plot)

    ax_fft.plot(freqs[mask], mags_db[mask], color="#1f77b4", linewidth=1.2, label="Current Spectrum")
    ax_fft.set_title(f"MCSA Spectrum (Fundamental fs = {fs:.2f} Hz)", fontsize=11, fontweight="bold")
    ax_fft.set_xlabel("Frequency (Hz)")
    ax_fft.set_ylabel("Amplitude (dB relative to 1 A)")
    ax_fft.grid(True, linestyle="--", alpha=0.6)

    # Annotate sidebands
    for peak in result.identified_peaks:
        if peak.label in ["BRB_LEFT_SIDEBAND", "BRB_RIGHT_SIDEBAND"]:
            ax_fft.axvline(peak.frequency_hz, color="red", linestyle=":", alpha=0.8)
            ax_fft.annotate(
                f"{peak.label[:3]}\n{peak.frequency_hz:.1f}Hz\n({peak.delta_to_fundamental_db:.1f}dB)",
                xy=(peak.frequency_hz, peak.magnitude_db),
                xytext=(peak.frequency_hz - 5, peak.magnitude_db - 15),
                arrowprops=dict(arrowstyle="->", color="red", lw=1),
                fontsize=8,
                color="darkred",
            )

    # 3. Park's Vector Orbit
    ax_park = axes[1, 0]
    if result.raw_signal.shape[0] >= 3:
        ia = result.preprocessed_signal[0, :]
        ib = result.preprocessed_signal[1, :]
        ic = result.preprocessed_signal[2, :]
        id_comp = np.sqrt(2.0 / 3.0) * ia - (1.0 / np.sqrt(6.0)) * ib - (1.0 / np.sqrt(6.0)) * ic
        iq_comp = (1.0 / np.sqrt(2.0)) * ib - (1.0 / np.sqrt(2.0)) * ic
        ax_park.plot(id_comp[:1000], iq_comp[:1000], color="#2ca02c", linewidth=0.8, alpha=0.7)
        ax_park.set_title("Park's Vector Orbit (id vs iq)", fontsize=11, fontweight="bold")
        ax_park.set_xlabel("Direct Axis Current i_d (A)")
        ax_park.set_ylabel("Quadrature Axis Current i_q (A)")
        ax_park.axis("equal")
        ax_park.grid(True, linestyle="--", alpha=0.6)
    else:
        ax_park.text(
            0.5, 0.5,
            "Park's Vector unavailable\n(Single-phase current recording)",
            ha="center", va="center", transform=ax_park.transAxes,
        )
        ax_park.set_title("Park's Vector Orbit", fontsize=11, fontweight="bold")

    # 4. Hilbert Envelope Demodulation Spectrum
    ax_env = axes[1, 1]
    if result.envelope_frequencies is not None and result.envelope_magnitudes is not None:
        mask_env = (result.envelope_frequencies >= 1.0) & (result.envelope_frequencies <= 200.0)
        ax_env.plot(
            result.envelope_frequencies[mask_env],
            result.envelope_magnitudes[mask_env],
            color="#ff7f0e",
            linewidth=1.0,
        )
        ax_env.set_title("Hilbert Envelope Spectrum (Low-Frequency Modulations)", fontsize=11, fontweight="bold")
        ax_env.set_xlabel("Modulation Frequency (Hz)")
        ax_env.set_ylabel("Envelope Magnitude (A)")
        ax_env.grid(True, linestyle="--", alpha=0.6)

    fig.suptitle(
        f"Motor Current Signature Analysis — {result.provenance.get('source_file_id', 'Recording')}\n"
        f"BRB Severity: {result.sideband_analysis.get('brb_severity_indication', 'UNKNOWN')} | "
        f"Delta dB: {result.sideband_analysis.get('brb_min_delta_db', 0.0):.1f} dB",
        fontsize=13,
        fontweight="bold",
    )

    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def print_summary_report(result: MCSAAnalysisResult) -> None:
    """Prints a clean ASCII diagnostic report to terminal."""
    print("=" * 72)
    print("         MOTOR CURRENT SIGNATURE ANALYSIS (MCSA) ENGINE REPORT")
    print("=" * 72)
    print(f" Source File      : {result.provenance.get('source_file_id', 'N/A')}")
    print(f" Dataset Origin   : {result.provenance.get('dataset_id', 'N/A')}")
    print(f" Sampling Rate    : {result.sampling_rate_hz:,.1f} Hz")
    print(f" Total Samples    : {result.num_samples:,} points ({result.duration_seconds:.3f} s)")
    print(f" Frequency Resol. : {result.frequency_resolution_hz:.4f} Hz")
    print("-" * 72)
    print(" ELECTRICAL & SPECTRAL METRICS:")
    print(f" Fundamental Freq (fs) : {result.fundamental_frequency_hz:.2f} Hz")
    print(f" Fundamental Amplitude : {result.fundamental_amplitude_amp:.2f} A ({result.fundamental_amplitude_db:.1f} dB)")
    print(f" Calculated Slip (s)   : {result.motor_slip:.4f}" if result.motor_slip else " Calculated Slip (s)   : N/A")
    print(f" Total Harmonic Dist.  : {result.thd_percentage:.2f} %")
    if "parks_vector_unbalance_ratio" in result.parks_vector_features:
        print(f" 3-Phase Unbalance     : {result.parks_vector_features['parks_vector_unbalance_ratio']*100:.2f} %")
    print("-" * 72)
    print(" FAULT SIDEBAND ANALYSIS (BRB & Harmonics):")
    sb = result.sideband_analysis
    print(f" Left Sideband (1-2s)fs : {sb.get('brb_left_freq_hz', 0.0):.2f} Hz | Amp: {sb.get('brb_left_amp_db', 0.0):.1f} dB | Delta: {sb.get('brb_left_delta_db', 0.0):.1f} dB")
    print(f" Right Sideband (1+2s)fs: {sb.get('brb_right_freq_hz', 0.0):.2f} Hz | Amp: {sb.get('brb_right_amp_db', 0.0):.1f} dB | Delta: {sb.get('brb_right_delta_db', 0.0):.1f} dB")
    print(f" Minimum Delta dB       : {sb.get('brb_min_delta_db', 0.0):.1f} dB")
    print(f" Physical Indication    : {sb.get('brb_severity_indication', 'N/A')}")
    if result.operational_warnings:
        print("-" * 72)
        print(" OPERATIONAL WARNINGS:")
        for w in result.operational_warnings:
            print(f" [!] {w}")
    print("=" * 72)


def main():
    parser = argparse.ArgumentParser(description="Reproducible Motor Current Signature Analysis CLI")
    parser.add_argument("--input", "-i", type=str, required=True, help="Path to input current CSV file")
    parser.add_argument("--format", "-f", type=str, choices=["auto", "4tu", "lias", "paderborn", "generic"], default="auto")
    parser.add_argument("--label", "-l", type=str, default="healthy", help="Label or ground truth")
    parser.add_argument("--sampling-rate", "-fs", type=float, default=None, help="Sampling frequency (Hz)")
    parser.add_argument("--rpm", type=float, default=None, help="Operating motor rotational speed (RPM)")
    parser.add_argument("--poles", type=int, default=4, help="Number of motor poles (default 4)")
    parser.add_argument("--output-json", type=str, default=None, help="Path to output JSON file")
    parser.add_argument("--output-plot", type=str, default=None, help="Path to output diagnostic plot image (PNG)")

    args = parser.parse_args()
    input_path = Path(args.input)

    if not input_path.exists():
        print(f"Error: Input file does not exist: {input_path}", file=sys.stderr)
        sys.exit(1)

    fmt = auto_detect_format(input_path) if args.format == "auto" else args.format

    try:
        recording = load_file(input_path, fmt, source_label=args.label, sampling_rate=args.sampling_rate)
        engine = MCSAEngine()
        result = engine.analyze(recording, operating_rpm=args.rpm, poles=args.poles)

        print_summary_report(result)

        if args.output_json:
            out_json = Path(args.output_json)
            out_json.parent.mkdir(parents=True, exist_ok=True)
            export_dict = {
                "provenance": result.provenance,
                "sampling_rate_hz": result.sampling_rate_hz,
                "duration_seconds": result.duration_seconds,
                "frequency_resolution_hz": result.frequency_resolution_hz,
                "fundamental_frequency_hz": result.fundamental_frequency_hz,
                "fundamental_amplitude_amp": result.fundamental_amplitude_amp,
                "fundamental_amplitude_db": result.fundamental_amplitude_db,
                "motor_slip": result.motor_slip,
                "thd_percentage": result.thd_percentage,
                "time_features": result.time_features,
                "sideband_analysis": result.sideband_analysis,
                "operational_warnings": result.operational_warnings,
                "confidence_metrics": result.confidence_metrics,
            }
            with open(out_json, "w", encoding="utf-8") as f:
                json.dump(export_dict, f, indent=2)
            print(f"[+] Diagnostic JSON exported to: {out_json}")

        if args.output_plot:
            out_plot = Path(args.output_plot)
            render_diagnostic_plot(result, out_plot)
            print(f"[+] Diagnostic Plot saved to: {out_plot}")

    except Exception as e:
        print(f"[!] Processing Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

"""
Sample Recording Generator for Testing Dataset Adapters.

Creates small, lightweight sample CSV files following the exact column schemas
of 4TU NLN-EMP, LIAS MCSA-DC, and Paderborn datasets to enable end-to-end adapter testing
without committing massive multi-gigabyte raw archives.
"""

from pathlib import Path
import numpy as np


def generate_sample_files(target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    fs = 20000.0  # 20 kHz
    num_samples = 500  # 500 points (~0.025s to 0.05s) for lightweight unit tests
    t = np.linspace(0, num_samples / fs, num_samples, endpoint=False)
    omega = 2 * np.pi * 50.0

    # 1. 4TU NLN-EMP format:
    # 11 columns: I_u, I_v, I_w (A), V_u, V_v, V_w (V), Acc_1..5 (g)
    iu = 14.1 * np.cos(omega * t)
    iv = 14.1 * np.cos(omega * t - 2 * np.pi / 3)
    iw = 14.1 * np.cos(omega * t + 2 * np.pi / 3)
    vu = 326.0 * np.cos(omega * t)
    vv = 326.0 * np.cos(omega * t - 2 * np.pi / 3)
    vw = 326.0 * np.cos(omega * t + 2 * np.pi / 3)
    acc1 = 0.5 * np.sin(2 * np.pi * 120 * t)
    acc2 = 0.4 * np.sin(2 * np.pi * 120 * t)
    acc3 = 0.3 * np.sin(2 * np.pi * 120 * t)
    acc4 = 0.2 * np.sin(2 * np.pi * 120 * t)
    acc5 = 0.1 * np.sin(2 * np.pi * 120 * t)

    nln_emp_matrix = np.column_stack([iu, iv, iw, vu, vv, vw, acc1, acc2, acc3, acc4, acc5])
    header_4tu = "I_u,I_v,I_w,V_u,V_v,V_w,Acc_1,Acc_2,Acc_3,Acc_4,Acc_5"
    np.savetxt(target_dir / "nln_emp_sample_healthy.csv", nln_emp_matrix, delimiter=",", header=header_4tu, comments="")

    # 4TU BRB sample (adds 48Hz and 52Hz sidebands to current)
    s = 0.02
    brb_mod = 0.2 * (np.cos(2 * np.pi * (1 - 2*s)*50*t) + np.cos(2 * np.pi * (1 + 2*s)*50*t))
    nln_emp_brb = nln_emp_matrix.copy()
    nln_emp_brb[:, 0] += brb_mod
    np.savetxt(target_dir / "nln_emp_sample_brb.csv", nln_emp_brb, delimiter=",", header=header_4tu, comments="")

    # High-resolution 1.0s benchmark (fs=5000 Hz, 5000 samples -> df=1.0 Hz)
    fs_bench = 5000.0
    n_bench = 5000
    t_bench = np.linspace(0, 1.0, n_bench, endpoint=False)
    iu_bench = 14.1 * np.cos(omega * t_bench)
    iv_bench = 14.1 * np.cos(omega * t_bench - 2 * np.pi / 3)
    iw_bench = 14.1 * np.cos(omega * t_bench + 2 * np.pi / 3)
    # Add clear BRB sidebands at 48 Hz and 52 Hz with -40 dB amplitude (~0.14 A)
    iu_bench += 0.14 * (np.cos(2 * np.pi * 48.0 * t_bench) + np.cos(2 * np.pi * 52.0 * t_bench))
    bench_zeros = np.zeros((n_bench, 8))
    bench_matrix = np.column_stack([iu_bench, iv_bench, iw_bench, bench_zeros])
    np.savetxt(target_dir / "nln_emp_benchmark_brb_1s.csv", bench_matrix, delimiter=",", header=header_4tu, comments="")

    # 2. LIAS MCSA-DC format:
    # 9 columns: Time, isa, isb, isc, Vsa, Vsb, Vsc, Speed, Rotor_Pos
    dt = 1.0 / 10000.0
    t_lias = np.arange(num_samples) * dt
    isa = 2.5 * np.cos(omega * t_lias)
    isb = 2.5 * np.cos(omega * t_lias - 2 * np.pi / 3)
    isc = 2.5 * np.cos(omega * t_lias + 2 * np.pi / 3)
    vsa = 400.0 * np.cos(omega * t_lias)
    vsb = 400.0 * np.cos(omega * t_lias - 2 * np.pi / 3)
    vsc = 400.0 * np.cos(omega * t_lias + 2 * np.pi / 3)
    speed = np.full(num_samples, 149.2)  # ~1425 RPM in rad/s
    pos = np.mod(speed * t_lias, 2 * np.pi)

    lias_matrix = np.column_stack([t_lias, isa, isb, isc, vsa, vsb, vsc, speed, pos])
    header_lias = "Time,isa,isb,isc,Vsa,Vsb,Vsc,Speed,Rotor_Pos"
    np.savetxt(target_dir / "ccs0.csv", lias_matrix, delimiter=",", header=header_lias, comments="")

    # LIAS BRB file ccs60.csv (1 broken bar)
    lias_brb = lias_matrix.copy()
    lias_brb[:, 1] += 0.05 * (np.cos(2 * np.pi * 48.0 * t_lias) + np.cos(2 * np.pi * 52.0 * t_lias))
    np.savetxt(target_dir / "ccs60.csv", lias_brb, delimiter=",", header=header_lias, comments="")

    # 3. Paderborn format:
    # 3 columns: phase_current_1, phase_current_2, vibration_accel
    p1 = 3.2 * np.cos(omega * t)
    p2 = 3.2 * np.cos(omega * t - 2 * np.pi / 3)
    vib = 1.2 * np.sin(2 * np.pi * 1000 * t)
    paderborn_matrix = np.column_stack([p1, p2, vib])
    np.savetxt(target_dir / "paderborn_sample_k001.csv", paderborn_matrix, delimiter=",")

    paderborn_ka01 = paderborn_matrix.copy()
    paderborn_ka01[:, 0] += 0.04 * np.cos(2 * np.pi * 155.4 * t)
    np.savetxt(target_dir / "paderborn_sample_ka01.csv", paderborn_ka01, delimiter=",")


if __name__ == "__main__":
    generate_sample_files(Path(__file__).parent)
    print("Sample test files generated successfully.")

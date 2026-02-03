"""
Chalk grains via slip-stick friction synthesis (same physics as GitHub.com/WillCMcC/slipstick-).
Uses scipy for filtering. Run from project root: python scripts/generate_chalk_grains.py
Output: public/chalk_grains/grain_000.wav ... + tap + manifest
"""

import json
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "chalk_grains"
NUM_GRAINS = 60
GRAIN_LEN_MIN = 0.05
GRAIN_LEN_MAX = 0.12
TAP_LEN = 0.06


# ---- Slip-stick physics (from WillCMcC/slipstick- approach) ----
def friction_force(velocity: float, friction_coeff: float) -> float:
    if velocity > 0:
        return -friction_coeff
    if velocity < 0:
        return friction_coeff
    return 0.0


def acceleration(
    position: float,
    velocity: float,
    spring_const: float,
    damping_coeff: float,
    friction_coeff: float,
    mass: float,
) -> float:
    spring_force = -spring_const * position
    damping_force = -damping_coeff * velocity
    friction = friction_force(velocity, friction_coeff)
    return (spring_force + damping_force + friction) / mass


def slip_stick_simulation(
    t: np.ndarray,
    init_position: float,
    init_velocity: float,
    mass: float,
    spring_const: float,
    damping_coeff: float,
    friction_coeff: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Euler integration; returns (position, velocity). Same model as slipstick repo."""
    dt = float(t[1] - t[0])
    position = np.zeros_like(t, dtype=np.float64)
    velocity = np.zeros_like(t, dtype=np.float64)
    position[0] = init_position
    velocity[0] = init_velocity
    for i in range(1, len(t)):
        a = acceleration(
            position[i - 1], velocity[i - 1],
            spring_const, damping_coeff, friction_coeff, mass,
        )
        velocity[i] = velocity[i - 1] + a * dt
        position[i] = position[i - 1] + velocity[i - 1] * dt
    return position, velocity


def butter_highpass(cutoff: float, fs: int, order: int = 4):
    nyq = 0.5 * fs
    normal_cutoff = cutoff / nyq
    b, a = butter(order, normal_cutoff, btype="high", analog=False)
    return b, a


def butter_lowpass(cutoff: float, fs: int, order: int = 4):
    nyq = 0.5 * fs
    normal_cutoff = min(cutoff / nyq, 0.99)
    b, a = butter(order, normal_cutoff, btype="low", analog=False)
    return b, a


def highpass_filter(data: np.ndarray, cutoff: float, fs: int, order: int = 4) -> np.ndarray:
    b, a = butter_highpass(cutoff, fs, order=order)
    return lfilter(b, a, data).astype(np.float32)


def lowpass_filter(data: np.ndarray, cutoff: float, fs: int, order: int = 4) -> np.ndarray:
    b, a = butter_lowpass(cutoff, fs, order=order)
    return lfilter(b, a, data).astype(np.float32)


def one_grain_slipstick(
    sr: int,
    length_sec: float,
    mass: float,
    stiffness: float,
    damping: float,
    friction: float,
    init_velocity: float,
    lowpass_hz: float,
    highpass_hz: float,
    gain: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """One chalk-like grain using slip-stick friction (GitHub slipstick approach)."""
    n = int(sr * length_sec)
    if n < 100:
        n = 100
    dt = 1.0 / sr
    t = np.arange(0, n * dt, dt)[:n]
    if len(t) < n:
        t = np.arange(n, dtype=np.float64) * dt

    position, velocity = slip_stick_simulation(
        t, 0.0, init_velocity, mass, stiffness, damping, friction
    )
    # Use velocity (friction events) for scrape texture; mix with position for body
    sig = (0.4 * position + 0.6 * velocity).astype(np.float64)

    # Envelope: quick attack, decay
    attack = int(n * 0.02)
    decay_start = int(n * 0.5)
    env = np.ones(n, dtype=np.float64)
    if attack > 0:
        env[:attack] = np.linspace(0, 1, attack)
    if decay_start < n:
        env[decay_start:] = np.linspace(1, 0.1, n - decay_start)
    sig = sig * env

    sig = highpass_filter(sig, highpass_hz, sr)
    sig = lowpass_filter(sig, lowpass_hz, sr)
    sig = np.tanh(sig * 2.0) * gain
    return sig.astype(np.float32)


def write_wav(path: Path, sr: int, sig: np.ndarray) -> None:
    sig = np.clip(sig, -1, 1)
    samples = (sig * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(samples.tobytes())


def generate_grains() -> None:
    rng = np.random.default_rng(42)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict = {"grains": [], "tap": None, "sampleRate": SR}

    # Chalk-like slip-stick params (short, gritty)
    for i in range(NUM_GRAINS):
        length = rng.uniform(GRAIN_LEN_MIN, GRAIN_LEN_MAX)
        mass = rng.uniform(0.008, 0.025)
        stiffness = rng.uniform(800, 2500)
        damping = rng.uniform(0.03, 0.12)
        friction = rng.uniform(0.003, 0.009)
        init_vel = rng.uniform(0.3, 1.2)
        lowpass_hz = rng.uniform(2200, 4500)
        highpass_hz = rng.uniform(200, 600)
        gain = rng.uniform(0.25, 0.45)

        sig = one_grain_slipstick(
            SR, length, mass, stiffness, damping, friction,
            init_vel, lowpass_hz, highpass_hz, gain, rng,
        )
        sig *= 0.5 / (np.abs(sig).max() or 1)
        name = f"grain_{i:03d}.wav"
        write_wav(OUT_DIR / name, SR, sig)
        manifest["grains"].append({"file": name, "duration": length})

    # Tap: one short slip-stick burst
    tap_sig = one_grain_slipstick(
        SR, TAP_LEN,
        mass=0.01, stiffness=2000, damping=0.15, friction=0.006,
        init_velocity=1.0, lowpass_hz=3500, highpass_hz=400, gain=0.5, rng=rng,
    )
    tap_sig *= np.exp(-np.linspace(0, 5, len(tap_sig)))
    tap_sig *= 0.55 / (np.abs(tap_sig).max() or 1)
    write_wav(OUT_DIR / "chalk_tap.wav", SR, tap_sig)
    manifest["tap"] = "chalk_tap.wav"

    with open(OUT_DIR / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Wrote {NUM_GRAINS} grains + tap to {OUT_DIR}")
    print("(Slip-stick friction synthesis, same approach as github.com/WillCMcC/slipstick-)")


if __name__ == "__main__":
    generate_grains()

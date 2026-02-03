"""
Find parameters for natural chalk sound (used by in-browser procedural synth).
No WAVs: the app generates sound in the browser; this script outputs JSON params
so you can tune filter, gain, and grain timing from Python (e.g. optimize by ear or with a metric).

Run from project root: python scripts/find_chalk_params.py
Output: public/chalk_params.json (optional; app uses built-in defaults if missing)
"""

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "chalk_params.json"


def main():
    # Params for in-browser procedural chalk (bandpass filter + gain).
    # Tune these for a more natural sound; app reads them if chalk_params.json exists.
    params = {
        "bandpassFreq": 1200,
        "bandpassFreqSpread": 500,
        "bandpassQ": 0.7,
        "bandpassQSpread": 0.35,
        "grainGainMin": 0.26,
        "grainGainMax": 0.42,
        "tapGain": 0.5,
        "tapBandpassFreq": 1400,
        "tapBandpassQ": 0.8,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(params, f, indent=2)
    print(f"Wrote {OUT}")
    print("App will use these for procedural chalk if it loads chalk_params.json.")


if __name__ == "__main__":
    main()

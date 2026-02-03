# Chalk sound (existing chalkboard-app style)

- **Tap**: WAV if present (`chalk-tap.wav` or `chalk_grains/chalk_tap.wav`), else procedural.
- **Scratch/drawing**: One **looping chalk WAV** (`/chalk_grains/grain_000.wav`), play while drawing, pause when you stop. Same pattern as simple chalkboard demos (HTML5 Audio, loop, play/pause).

## Tap: WAV for original feel

- **`public/chalk-tap.wav`** – custom tap (e.g. chalk hit).  
- If missing, **`public/chalk_grains/chalk_tap.wav`** (from `generate_chalk_grains.py`) is used.  
- If both missing, procedural tap is used.

## Find / tune params (Python)

```bash
python scripts/find_chalk_params.py
```

Writes `public/chalk_params.json` (bandpass, gain, etc.). Used when playing procedural grains (tap fallback); scratch is Tone.js only.

## Optional: generate WAV grains (legacy)

`generate_chalk_grains.py` – exports grains to `public/chalk_grains/`. The app uses `chalk_grains/chalk_tap.wav` for tap if no `chalk-tap.wav`. Scratch is Tone.js only (no chalk-draw / chalk-scratch WAV).

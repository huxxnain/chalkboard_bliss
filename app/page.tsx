/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useRef, useEffect, useState } from "react";
import * as Tone from "tone";

interface Coordinates {
  x: number;
  y: number;
}

export default function ChalkboardBliss() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [hasMoved, setHasMoved] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [audioReady, setAudioReady] = useState<boolean>(false);
  const fillIntervalRef = useRef<number | null>(null);
  const lastAngleRef = useRef<number | null>(null);
  const straightScoreRef = useRef<number>(0);
  const usingStraightRef = useRef<boolean>(false);
  // Audio: procedural only (no WAVs). Optional params from Python (find_chalk_params.py).
  const audioContextRef = useRef<AudioContext | null>(null);
  const chalkBuffersRef = useRef<{
    grains: AudioBuffer[];
    tap: AudioBuffer | null;
  }>({ grains: [], tap: null });
  const chalkParamsRef = useRef<{
    bandpassFreq?: number;
    bandpassFreqSpread?: number;
    bandpassQ?: number;
    bandpassQSpread?: number;
    grainGainMin?: number;
    grainGainMax?: number;
    tapGain?: number;
    tapBandpassFreq?: number;
    tapBandpassQ?: number;
  } | null>(null);
  const tapIsWavRef = useRef(false);
  /** Scratch: Tone.js brown noise + bandpass */
  const toneNoiseRef = useRef<Tone.Noise | null>(null);
  const toneFilterRef = useRef<Tone.Filter | null>(null);
  const toneGainRef = useRef<Tone.Gain | null>(null);
  const toneScratchStartedRef = useRef(false);
  const filterDriftRef = useRef(0);

  const lastPosRef = useRef<Coordinates>({ x: 0, y: 0 });
  const lastTimeRef = useRef<number>(0);
  const hasPlayedTapRef = useRef(false);
  const stillnessTimerRef = useRef<number | null>(null);
  const currentDrawingSessionRef = useRef<number>(0);
  const accumulatedDistanceRef = useRef<number>(0);

  // Chalk sound: 100% procedural in browser (no WAVs). Python can export params to tune.
  useEffect(() => {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    // Pink noise (Voss-McCartney) into float32 array
    const pinkNoise = (n: number): Float32Array => {
      const out = new Float32Array(n);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        out[i] = pink;
      }
      const max = Math.max(1e-6, ...Array.from(out).map(Math.abs));
      for (let i = 0; i < n; i++) out[i] /= max;
      return out;
    };

    const envelope = (n: number, attackFrac: number, decayFrac: number): Float32Array => {
      const env = new Float32Array(n);
      const attack = Math.floor(n * attackFrac);
      const decayStart = Math.floor(n * (1 - decayFrac));
      for (let i = 0; i < attack; i++) env[i] = i / attack;
      for (let i = attack; i < decayStart; i++) env[i] = 1;
      for (let i = decayStart; i < n; i++) env[i] = 1 - (i - decayStart) / (n - decayStart) * 0.85;
      return env;
    };

    const sr = ctx.sampleRate;
    const grains: AudioBuffer[] = [];

    const tapLen = Math.floor(sr * 0.06);
    const tapBuf = ctx.createBuffer(1, tapLen, sr);
    const tapCh = tapBuf.getChannelData(0);
    const tapNoise = pinkNoise(tapLen);
    for (let j = 0; j < tapLen; j++) tapCh[j] = tapNoise[j] * (1 - j / tapLen) * 0.5;
    const tapMax = Math.max(1e-6, ...Array.from(tapCh).map(Math.abs));
    for (let j = 0; j < tapLen; j++) tapCh[j] /= tapMax * 2;

    chalkBuffersRef.current = { grains, tap: tapBuf };

    fetch("/chalk_params.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p) chalkParamsRef.current = p;
      })
      .catch(() => {});

    // Tap: use WAV if present. Try public root then chalk_grains/
    const tryTapWav = (path: string) =>
      fetch(path)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => (ab ? ctx.decodeAudioData(ab) : null));
    tryTapWav("/chalk-tap.wav")
      .then((wavTap) => {
        if (wavTap) {
          chalkBuffersRef.current.tap = wavTap;
          tapIsWavRef.current = true;
          return;
        }
        return tryTapWav("/chalk_grains/chalk_tap.wav");
      })
      .then((wavTap) => {
        if (wavTap) {
          chalkBuffersRef.current.tap = wavTap;
          tapIsWavRef.current = true;
        }
      })
      .catch(() => {});

    // Scratch: brown noise + bandpass only (warm, natural chalk)
    const noise = new Tone.Noise("brown");
    const filter = new Tone.Filter({
      type: "bandpass",
      frequency: 1100,
      Q: 0.55,
    });
    const gain = new Tone.Gain(0).toDestination();
    noise.connect(filter);
    filter.connect(gain);
    gain.gain.value = 0;
    toneNoiseRef.current = noise;
    toneFilterRef.current = filter;
    toneGainRef.current = gain;

    setAudioReady(true);

    return () => {
      ctx.close();
      try {
        noise.dispose();
        filter.dispose();
        gain.dispose();
      } catch (_) {}
      toneNoiseRef.current = null;
      toneFilterRef.current = null;
      toneGainRef.current = null;
    };
  }, []);

  const startToneScratch = (): void => {
    if (toneScratchStartedRef.current) return;
    const n = toneNoiseRef.current;
    const g = toneGainRef.current;
    if (!n || !g) return;
    Tone.start().then(() => {
      n.start();
      g.gain.rampTo(0.38, 0.02);
      toneScratchStartedRef.current = true;
    }).catch(() => {});
  };

  const updateToneScratch = (speed: number, angleDiffRad: number): void => {
    const filter = toneFilterRef.current;
    const g = toneGainRef.current;
    if (!filter || !g) return;
    filterDriftRef.current += (Math.random() - 0.5) * 70;
    filterDriftRef.current = Math.max(-180, Math.min(180, filterDriftRef.current));
    const speedFreq = 850 + Math.min(750, speed * 90);
    const speedGain = 0.22 + Math.min(0.2, speed * 0.014);
    const curveBoost = Math.min(400, angleDiffRad * 900);
    const gainVal = Math.min(0.48, speedGain + angleDiffRad * 0.5);
    const freq = speedFreq + curveBoost + filterDriftRef.current;
    filter.frequency.rampTo(Math.max(500, Math.min(2000, freq)), 0.04);
    g.gain.rampTo(gainVal, 0.04);
  };

  const stopToneScratch = (): void => {
    if (!toneScratchStartedRef.current) return;
    const n = toneNoiseRef.current;
    const g = toneGainRef.current;
    if (g) g.gain.rampTo(0, 0.04);
    if (n) n.stop();
    toneScratchStartedRef.current = false;
    filterDriftRef.current = 0;
  };

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.src = "/Bb.jpg.jpeg";
    img.onload = () => {
      bgImageRef.current = img;
      setImageLoaded(true);
      resizeCanvas();
    };
    img.onerror = () => resizeCanvas();

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      if (bgImageRef.current) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.fillStyle = "#1a2622";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [imageLoaded]);

  // Play tap: WAV (original feel, dry) or procedural (bandpass)
  const playTapSound = (): void => {
    const ctx = audioContextRef.current;
    const tapBuffer = chalkBuffersRef.current.tap;
    const p = chalkParamsRef.current;
    if (!ctx || !tapBuffer) return;
    if (ctx.state === "suspended") ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = tapBuffer;
    const gain = ctx.createGain();
    gain.gain.value = p?.tapGain ?? (tapIsWavRef.current ? 0.6 : 0.5);

    if (tapIsWavRef.current) {
      source.connect(gain);
      gain.connect(ctx.destination);
    } else {
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = p?.tapBandpassFreq ?? 1400;
      filter.Q.value = p?.tapBandpassQ ?? 0.8;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
    }
    source.start();
  };

  // Scratch: Tone.js brown noise + bandpass; modulate by speed and curvature
  const updateScratchSound = (speed: number, angleDiffRad: number): void => {
    startToneScratch();
    updateToneScratch(speed, angleDiffRad);
  };

  // Clear the stillness timer (kept for any future use; grains need no stop)
  const clearStillnessTimer = (): void => {
    if (stillnessTimerRef.current) {
      clearTimeout(stillnessTimerRef.current);
      stillnessTimerRef.current = null;
    }
  };

  const resetStillnessTimer = (): void => {
    clearStillnessTimer();
  };

  const isInDrawableArea = (x: number, y: number): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const rect = canvas.getBoundingClientRect();
    const leftBorder = rect.width * 0.06;
    const rightBorder = rect.width * 0.94;
    const topBorder = rect.height * 0.035;
    const bottomBorder = rect.height * 0.965;

    return (
      x >= leftBorder && x <= rightBorder && y >= topBorder && y <= bottomBorder
    );
  };

  const getCoordinates = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ): Coordinates => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ): void => {
    e.preventDefault();

    const { x, y } = getCoordinates(e);
    if (!isInDrawableArea(x, y)) return;

    const now = performance.now();

    // Increment session counter to track unique drawing sessions
    currentDrawingSessionRef.current += 1;

    setIsDrawing(true);
    setHasMoved(false);
    lastAngleRef.current = null;
    straightScoreRef.current = 0;
    usingStraightRef.current = false;
    lastPosRef.current = { x, y };
    lastTimeRef.current = now;

    const canvas = canvasRef.current;
    if (!canvas) return;

    hasPlayedTapRef.current = false;
    accumulatedDistanceRef.current = 0;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);

    // Play tap sound only once at the very start of a new touch
    playTapSound();
    hasPlayedTapRef.current = true;

    // Draw initial dot
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fill();

    // Stationary hold effect
    fillIntervalRef.current = window.setInterval(() => {
      if (!hasMoved && isDrawing) {
        const holdTime = performance.now() - now;
        if (holdTime > 100) {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.beginPath();
          const radius = 1 + Math.random() * 0.8;
          ctx.arc(
            x + (Math.random() - 0.5) * 3,
            y + (Math.random() - 0.5) * 3,
            radius,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + Math.random() * 0.25})`;
          ctx.fill();
        }
      }
    }, 100);
  };

  const draw = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ): void => {
    if (!isDrawing) return;
    e.preventDefault();

    const { x, y } = getCoordinates(e);

    if (!isInDrawableArea(x, y)) {
      stopDrawing();
      return;
    }

    const timestamp = performance.now();
    const deltaX = x - lastPosRef.current.x;
    const deltaY = y - lastPosRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const deltaTime = timestamp - lastTimeRef.current || 16;
    const speed = distance / deltaTime;

    if (distance > 2) {
      setHasMoved(true);
    }

    if (distance > 0.3) {
      clearStillnessTimer();

      const angle = Math.atan2(deltaY, deltaX);

      let angleDiffRad = 0;
      if (lastAngleRef.current !== null) {
        const diff = Math.abs(angle - lastAngleRef.current);
        angleDiffRad = Math.min(diff, Math.PI * 2 - diff); // normalize wrap
        if (diff < 0.12) {
          straightScoreRef.current++;
        } else {
          straightScoreRef.current = 0;
        }
      }

      lastAngleRef.current = angle;

      const shouldUseStraight = straightScoreRef.current > 8;
      usingStraightRef.current = shouldUseStraight;

      // Scratch: Tone.js brown noise + bandpass (varies with speed + curvature)
      updateScratchSound(speed, angleDiffRad);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.lineTo(x, y);
      ctx.stroke();

      // Chalk dust particles
      if (distance > 2) {
        const particles = Math.floor(distance / 3);
        for (let i = 0; i < particles; i++) {
          const t = i / particles;
          const px = lastPosRef.current.x + (x - lastPosRef.current.x) * t;
          const py = lastPosRef.current.y + (y - lastPosRef.current.y) * t;

          const offsetX = (Math.random() - 0.5) * 3;
          const offsetY = (Math.random() - 0.5) * 3;
          const size = Math.random() * 1.5;

          ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3})`;
          ctx.fillRect(px + offsetX, py + offsetY, size, size);
        }
      }

      lastPosRef.current = { x, y };
      lastTimeRef.current = timestamp;

      // Stop scratch after ~80ms of no movement (pointer still down)
      clearStillnessTimer();
      stillnessTimerRef.current = window.setTimeout(() => {
        stopToneScratch();
        stillnessTimerRef.current = null;
      }, 80);
    }
  };

  const stopDrawing = (): void => {
    clearStillnessTimer();
    stopToneScratch();

    if (fillIntervalRef.current) {
      clearInterval(fillIntervalRef.current);
      fillIntervalRef.current = null;
    }

    if (isDrawing) {
      setIsDrawing(false);
    }
    lastAngleRef.current = null;
    straightScoreRef.current = 0;
    usingStraightRef.current = false;
  };

  const handleMouseLeave = (): void => {
    clearStillnessTimer();
    stopToneScratch();

    if (fillIntervalRef.current) {
      clearInterval(fillIntervalRef.current);
      fillIntervalRef.current = null;
    }
    setIsDrawing(false);
  };

  const clearCanvas = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#1a2622";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.restore();
  };
  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      <div className="bg-gray-800 p-4 shadow-lg flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Blackboard</h1>
        <div className="flex items-center gap-4">
          {!audioReady && (
            <span className="text-yellow-400 text-sm">Loading audio...</span>
          )}
          <button
            onClick={clearCanvas}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Clear Board
          </button>
        </div>
      </div>

      <div className="flex-1 p-4">
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-lg shadow-2xl cursor-crosshair touch-none"
          style={{ backgroundColor: "#1a2622" }}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
        />
      </div>

      <div className="bg-gray-800 p-3 text-center text-sm text-gray-400">
        By Ammar Hassan
      </div>
    </div>
  );
}

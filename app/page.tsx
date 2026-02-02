/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useRef, useEffect, useState } from "react";

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

  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const chalkBuffersRef = useRef<{
    draw: AudioBuffer | null;
    slow: AudioBuffer | null;
    fast: AudioBuffer | null;
    tap: AudioBuffer | null;
  }>({ draw: null, slow: null, fast: null, tap: null });
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);

  const lastPosRef = useRef<Coordinates>({ x: 0, y: 0 });
  const lastTimeRef = useRef<number>(0);
  const hasStartedSoundRef = useRef(false);
  const hasPlayedTapRef = useRef(false);
  const stillnessTimerRef = useRef<number | null>(null);
  const currentDrawingSessionRef = useRef<number>(0);

  // Load all chalk .wav files from public folder
  useEffect(() => {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const loadWavFile = async (path: string): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          return await ctx.decodeAudioData(arrayBuffer);
        }
      } catch (e) {
        console.warn(`Could not load ${path}`);
      }
      return null;
    };

    const loadChalkSounds = async () => {
      const [draw, slow, fast, tap] = await Promise.all([
        loadWavFile("/chalk-draw.wav"),
        loadWavFile("/chalk-slow.wav"),
        loadWavFile("/chalk-fast.wav"),
        loadWavFile("/chalk-tap.wav"),
      ]);

      chalkBuffersRef.current = { draw, slow, fast, tap };

      if (draw || slow || fast) {
        setAudioReady(true);
        console.log("✓ Loaded chalk sounds:", {
          draw: !!draw,
          slow: !!slow,
          fast: !!fast,
          tap: !!tap,
        });
      } else {
        console.log(
          "No chalk .wav files found. Add chalk-draw.wav to /public folder.",
        );
        createFallbackSound(ctx);
      }
    };

    loadChalkSounds();

    return () => {
      stopSound();
      ctx.close();
    };
  }, []);

  // Create fallback procedural sound (used only if no real audio file)
  const createFallbackSound = (ctx: AudioContext) => {
    const duration = 4;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Pink noise
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = pink * 0.04;
    }
    chalkBuffersRef.current = {
      draw: buffer,
      slow: buffer,
      fast: buffer,
      tap: null,
    };
    setAudioReady(true);
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

  // Play tap sound (chalk touching board) - one shot
  const playTapSound = (): void => {
    const ctx = audioContextRef.current;
    const tapBuffer = chalkBuffersRef.current.tap;
    if (!ctx || !tapBuffer) return;

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = tapBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  };

  // Start playing chalk drawing sound
  const startSound = () => {
    const ctx = audioContextRef.current;
    const buffer = chalkBuffersRef.current.draw;
    if (!ctx || !buffer || activeSourceRef.current) return;

    if (ctx.state === "suspended") ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 3000;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start();
    gain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.03);

    activeSourceRef.current = source;
    gainNodeRef.current = gain;
    filterNodeRef.current = filter;
  };

  // Update sound based on drawing speed
  const updateSound = (speed: number): void => {
    const ctx = audioContextRef.current;
    const gain = gainNodeRef.current;
    const filter = filterNodeRef.current;
    const source = activeSourceRef.current;
    if (!ctx || !gain || !filter || !source) return;

    // Volume responds to speed - more responsive range
    const volume = Math.min(0.3 + speed * 0.5, 0.85);
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);

    // Playback rate for natural feel - more variation
    const playbackRate = 0.85 + Math.min(speed * 0.3, 0.5);
    source.playbackRate.cancelScheduledValues(ctx.currentTime);
    source.playbackRate.setTargetAtTime(playbackRate, ctx.currentTime, 0.02);

    // Filter frequency responds more dramatically to speed changes
    const filterFreq = 1800 + Math.min(speed * 3000, 5000);
    filter.frequency.cancelScheduledValues(ctx.currentTime);
    filter.frequency.setTargetAtTime(filterFreq, ctx.currentTime, 0.02);
  };

  // Stop sound with fade out
  const stopSound = (): void => {
    const ctx = audioContextRef.current;
    const gain = gainNodeRef.current;
    const source = activeSourceRef.current;

    if (gain && ctx) {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    }

    setTimeout(() => {
      if (source) {
        try {
          source.stop();
          source.disconnect();
        } catch (e) {}
      }
      activeSourceRef.current = null;
      gainNodeRef.current = null;
      filterNodeRef.current = null;
      hasStartedSoundRef.current = false;
    }, 100);
  };

  // Clear the stillness timer
  const clearStillnessTimer = (): void => {
    if (stillnessTimerRef.current) {
      clearTimeout(stillnessTimerRef.current);
      stillnessTimerRef.current = null;
    }
  };

  // Start a timer to detect when drawing has stopped
  const resetStillnessTimer = (): void => {
    clearStillnessTimer();

    // If we're drawing and sound has started, set a timer to stop sound after 100ms of no movement
    if (isDrawing && hasStartedSoundRef.current) {
      stillnessTimerRef.current = window.setTimeout(() => {
        stopSound();
      }, 100);
    }
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
    lastPosRef.current = { x, y };
    lastTimeRef.current = now;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Reset flags for new drawing session
    hasStartedSoundRef.current = false;
    hasPlayedTapRef.current = false;

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
      // Clear any existing stillness timer since we're moving
      clearStillnessTimer();

      if (!hasStartedSoundRef.current) {
        startSound();
        hasStartedSoundRef.current = true;
      }

      // Update sound parameters based on speed - now happens every frame for better sync
      updateSound(speed);

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

      // Start a new stillness timer
      resetStillnessTimer();
    }
  };

  const stopDrawing = (): void => {
    clearStillnessTimer();

    if (fillIntervalRef.current) {
      clearInterval(fillIntervalRef.current);
      fillIntervalRef.current = null;
    }

    if (isDrawing) {
      setIsDrawing(false);
    }
    stopSound();
  };

  const handleMouseLeave = (): void => {
    clearStillnessTimer();

    if (fillIntervalRef.current) {
      clearInterval(fillIntervalRef.current);
      fillIntervalRef.current = null;
    }
    setIsDrawing(false);
    stopSound();
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

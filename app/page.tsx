/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useRef, useEffect, useState } from "react";

interface Coordinates {
  x: number;
  y: number;
}

export default function ProceduralBlackboard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [lastDrawTime, setLastDrawTime] = useState<number>(0);
  const [hasMoved, setHasMoved] = useState<boolean>(false);
  const [pressStartTime, setPressStartTime] = useState<number>(0);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const fillIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);
  const lastPosRef = useRef<Coordinates>({ x: 0, y: 0 });
  const lastTimeRef = useRef<number>(0);
  const activeGrainsRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isPlayingSoundRef = useRef<boolean>(false);

  // Initialize Web Audio API with realistic chalk sounds
  useEffect(() => {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContext();

    const sampleRate = audioContextRef.current.sampleRate;

    // Create realistic chalk noise (pink noise with grit)
    const bufferSize = sampleRate * 0.15; // 150ms grain
    const noiseBuffer = audioContextRef.current.createBuffer(
      1,
      bufferSize,
      sampleRate,
    );
    const output = noiseBuffer.getChannelData(0);

    // Smoother pink noise for natural chalk texture
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

      // Smoother envelope
      const t = i / bufferSize;
      const env = Math.sin(t * Math.PI) * 0.8;
      const grit = Math.random() > 0.85 ? Math.random() * 0.15 : 0;
      output[i] = (pink * 0.06 + grit) * env;
    }
    noiseBufferRef.current = noiseBuffer;

    return () => {
      activeGrainsRef.current.forEach((grain) => {
        try {
          grain.stop();
        } catch (e) {
          /* ignore */
        }
      });
      activeGrainsRef.current.clear();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Initialize canvas and background image
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Load background image
    const img = new Image();
    img.src = "/Bb.jpg.jpeg";
    img.onload = () => {
      bgImageRef.current = img;
      setImageLoaded(true);
      resizeCanvas();
    };
    img.onerror = () => {
      console.error("Failed to load background image");
      resizeCanvas();
    };

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      // Draw background image if loaded
      if (bgImageRef.current) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        // Fallback to solid color
        ctx.fillStyle = "#1a2622";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => window.removeEventListener("resize", resizeCanvas);
  }, [imageLoaded]);

  // Play chalk tap sound (improved version)
  const playImpact = (speed: number = 1): void => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    const hp = ctx.createBiquadFilter();

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const env = Math.exp(-i / (data.length * 0.18));
      data[i] = (Math.random() * 2 - 1) * env;
    }

    src.buffer = buffer;

    bp.type = "bandpass";
    bp.frequency.value = 1600 + speed * 900;
    bp.Q.value = 1.3;

    hp.type = "highpass";
    hp.frequency.value = 700;

    gain.gain.value = 0.3;

    src.connect(hp);
    hp.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);

    src.start();
    activeGrainsRef.current.add(src);

    src.onended = () => {
      activeGrainsRef.current.delete(src);
    };
  };

  // Play granular chalk sound (for continuous drawing)
  const playChalkGrain = (speed: number, pressure: number): void => {
    if (!audioContextRef.current || !noiseBufferRef.current) return;

    const source = audioContextRef.current.createBufferSource();
    const gain = audioContextRef.current.createGain();
    const filter = audioContextRef.current.createBiquadFilter();
    const filter2 = audioContextRef.current.createBiquadFilter();
    const lowShelf = audioContextRef.current.createBiquadFilter();

    source.buffer = noiseBufferRef.current;

    // Chalk frequency characteristics - more natural range with lower cutoff
    filter.type = "highpass";
    filter.frequency.value = 350 + Math.random() * 250; // Lower for more body

    filter2.type = "lowpass";
    filter2.frequency.value = 2600 + speed * 700 + Math.random() * 500;
    filter2.Q.value = 0.7;

    // Bass boost for scratch sound
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 300;
    lowShelf.gain.value = 6; // +6dB bass boost

    // Gentler volume
    const volume = Math.min(speed * 0.4 + 0.08, 0.35) * pressure;
    gain.gain.value = volume;

    // Slight pitch variation
    source.playbackRate.value = 0.9 + Math.random() * 0.15;

    source.connect(filter);
    filter.connect(lowShelf);
    lowShelf.connect(filter2);
    filter2.connect(gain);
    gain.connect(audioContextRef.current.destination);

    source.start();
    activeGrainsRef.current.add(source);

    source.onended = () => {
      activeGrainsRef.current.delete(source);
    };
  };

  // Calculate speed and trigger appropriate sounds
  const updateAudio = (
    x: number,
    y: number,
    timestamp: number,
    isStart: boolean = false,
  ): void => {
    if (!audioContextRef.current) return;

    const deltaX = x - lastPosRef.current.x;
    const deltaY = y - lastPosRef.current.y;
    const deltaTime = timestamp - lastTimeRef.current || 16;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const speed = Math.min(distance / deltaTime, 2);

    if (isStart) {
      // Play impact sound when starting to draw
      playImpact(speed);
      isPlayingSoundRef.current = true;
    } else if (distance > 0.3) {
      // More sensitive threshold
      // Play granular sound while moving
      const pressure = 0.7 + Math.random() * 0.3;

      // Play multiple grains for faster movements
      const grainCount = Math.max(1, Math.ceil(speed * 2));
      for (let i = 0; i < grainCount; i++) {
        setTimeout(() => {
          if (isPlayingSoundRef.current) {
            playChalkGrain(speed, pressure);
          }
        }, i * 15);
      }
    }
  };

  const stopAudio = (): void => {
    isPlayingSoundRef.current = false;
    // Clean up active grains
    activeGrainsRef.current.forEach((grain) => {
      try {
        grain.stop(audioContextRef.current!.currentTime + 0.05);
      } catch (e) {
        // Ignore if already stopped
      }
    });
  };

  // Play lift-off sound when stopping
  const playLiftSound = (): void => {
    if (!audioContextRef.current || !noiseBufferRef.current) return;

    const source = audioContextRef.current.createBufferSource();
    const gain = audioContextRef.current.createGain();
    const filter = audioContextRef.current.createBiquadFilter();

    source.buffer = noiseBufferRef.current;
    source.playbackRate.value = 1.3;

    filter.type = "highpass";
    filter.frequency.value = 500;

    gain.gain.value = 0.15;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioContextRef.current.destination);

    source.start();
    activeGrainsRef.current.add(source);

    source.onended = () => {
      activeGrainsRef.current.delete(source);
    };
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

    // Resume audio context if suspended (browser autoplay policy)
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume();
    }

    const { x, y } = getCoordinates(e);
    const now = performance.now();

    setIsDrawing(true);
    setHasMoved(false);
    setPressStartTime(now);
    lastPosRef.current = { x, y };
    lastTimeRef.current = now;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);

    // Play impact sound immediately
    updateAudio(x, y, now, true);

    // Draw initial dot immediately
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fill();

    // Start filling interval for held presses
    fillIntervalRef.current = window.setInterval(() => {
      if (!hasMoved && isDrawing) {
        const holdTime = performance.now() - now;

        // Continue filling after initial dot
        if (holdTime > 100) {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          // Draw filling dots
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

          // Occasional subtle sound
          if (Math.random() > 0.7) {
            playChalkGrain(0.2, 0.4);
          }
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
    const timestamp = performance.now();

    const deltaX = x - lastPosRef.current.x;
    const deltaY = y - lastPosRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Mark as moved if distance is significant
    if (distance > 2) {
      setHasMoved(true);
    }

    // Only draw if there's movement
    if (distance > 0.5) {
      // Update audio based on movement
      updateAudio(x, y, timestamp, false);

      // Draw on canvas with chalk texture
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Main chalk stroke
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.lineTo(x, y);
      ctx.stroke();

      // Add chalk dust particles for realism
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
      setLastDrawTime(timestamp);
    }
  };

  const stopDrawing = (): void => {
    // Clear fill interval
    if (fillIntervalRef.current) {
      clearInterval(fillIntervalRef.current);
      fillIntervalRef.current = null;
    }

    if (isDrawing) {
      // Play lift-off sound when releasing
      playLiftSound();
      setIsDrawing(false);
    }
    stopAudio();
  };

  const handleMouseLeave = (): void => {
    if (isDrawing) {
      // Play lift-off sound when leaving canvas
      playLiftSound();
    }

    // Clear fill interval
    if (fillIntervalRef.current) {
      clearInterval(fillIntervalRef.current);
      fillIntervalRef.current = null;
    }

    setIsDrawing(false);
    stopAudio();
  };

  const clearCanvas = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Save the current transform
    ctx.save();

    // Reset transform to clear entire canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Clear entire canvas using actual pixel dimensions
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image if loaded
    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      // Fallback to solid color
      ctx.fillStyle = "#1a2622";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Restore the original transform (including scale)
    ctx.restore();
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      <div className="bg-gray-800 p-4 shadow-lg flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Blackboard</h1>
        <button
          onClick={clearCanvas}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
        >
          Clear Board
        </button>
      </div>

      <div className="flex-1 p-4">
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-lg shadow-2xl cursor-crosshair touch-none"
          style={{ backgroundColor: "#1a2622" }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={handleMouseLeave}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>

      <div className="bg-gray-800 p-3 text-center text-sm text-gray-400">
        By Ammar Hassan
      </div>
    </div>
  );
}

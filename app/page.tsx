/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useRef, useEffect, useState } from "react";

interface Coordinates {
  x: number;
  y: number;
}

export default function ProceduralBlackboard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const noiseNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const lastPosRef = useRef<Coordinates>({ x: 0, y: 0 });
  const lastTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize Web Audio API

  useEffect(() => {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContext();

    // Create noise buffer (white noise)
    const bufferSize = audioContextRef.current.sampleRate * 2;
    const noiseBuffer = audioContextRef.current.createBuffer(
      1,
      bufferSize,
      audioContextRef.current.sampleRate,
    );
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    // Create audio nodes
    noiseNodeRef.current = audioContextRef.current.createBufferSource();
    noiseNodeRef.current.buffer = noiseBuffer;
    noiseNodeRef.current.loop = true;

    // Band-pass filter for chalk frequency range (1-3 kHz)
    filterNodeRef.current = audioContextRef.current.createBiquadFilter();
    filterNodeRef.current.type = "bandpass";
    filterNodeRef.current.frequency.value = 2000;
    filterNodeRef.current.Q.value = 1.5;

    // Gain node for volume control
    gainNodeRef.current = audioContextRef.current.createGain();
    gainNodeRef.current.gain.value = 0;

    // Connect audio graph
    noiseNodeRef.current.connect(filterNodeRef.current);
    filterNodeRef.current.connect(gainNodeRef.current);
    gainNodeRef.current.connect(audioContextRef.current.destination);

    // Start noise node
    noiseNodeRef.current.start();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      // Draw blackboard background
      ctx.fillStyle = "#1a2622";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  // Calculate speed and update audio parameters
  const updateAudio = (x: number, y: number, timestamp: number): void => {
    if (
      !audioContextRef.current ||
      !gainNodeRef.current ||
      !filterNodeRef.current
    )
      return;

    const deltaX = x - lastPosRef.current.x;
    const deltaY = y - lastPosRef.current.y;
    const deltaTime = timestamp - lastTimeRef.current || 16;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const speed = distance / deltaTime;

    // Map speed to gain (0-0.15 for subtle chalk sound)
    const targetGain = Math.min(speed * 3, 0.15);

    // Map speed to filter frequency (faster = higher pitch)
    const targetFreq = 1500 + Math.min(speed * 800, 1500);

    // Add slight randomness for texture variation
    const randomFactor = 0.9 + Math.random() * 0.2;

    // Smooth parameter changes
    const now = audioContextRef.current.currentTime;
    gainNodeRef.current.gain.linearRampToValueAtTime(
      targetGain * randomFactor,
      now + 0.01,
    );
    filterNodeRef.current.frequency.linearRampToValueAtTime(
      targetFreq * randomFactor,
      now + 0.01,
    );

    const directionChange = Math.abs(Math.atan2(deltaY, deltaX));
    filterNodeRef.current.Q.linearRampToValueAtTime(
      1.2 + directionChange * 0.5,
      now + 0.01,
    );
  };

  const stopAudio = (): void => {
    if (!audioContextRef.current || !gainNodeRef.current) return;

    const now = audioContextRef.current.currentTime;
    gainNodeRef.current.gain.linearRampToValueAtTime(0, now + 0.05);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
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
    setIsDrawing(true);
    lastPosRef.current = { x, y };
    lastTimeRef.current = performance.now();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
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

    // Update audio based on movement
    updateAudio(x, y, timestamp);

    // Draw on canvas
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

    lastPosRef.current = { x, y };
    lastTimeRef.current = timestamp;
  };

  const stopDrawing = (): void => {
    setIsDrawing(false);
    stopAudio();
  };

  const clearCanvas = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#1a2622";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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
          onMouseLeave={stopDrawing}
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

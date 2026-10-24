import React, { useEffect, useRef, useState } from 'react';
import { setRainAmbience } from '../utils/audio';

export function WeatherCanvasOverlay({
  weatherCode,
  manualWeatherMode = 'auto', // 'auto' | 'rain' | 'storm' | 'snow' | 'fog' | 'clear'
  soundEnabled = false
}) {
  const canvasRef = useRef(null);
  const [activeWeather, setActiveWeather] = useState('clear');
  const [lightningFlash, setLightningFlash] = useState(false);

  // Determine active weather type based on code or manual override
  useEffect(() => {
    if (manualWeatherMode !== 'auto') {
      setActiveWeather(manualWeatherMode);
      return;
    }

    if (!weatherCode && weatherCode !== 0) {
      setActiveWeather('clear');
      return;
    }

    // Map WMO Weather Codes to weather animation
    if ([95, 96, 99].includes(weatherCode)) {
      setActiveWeather('storm');
    } else if ([61, 63, 65, 80, 81, 82, 51, 53, 55].includes(weatherCode)) {
      setActiveWeather('rain');
    } else if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
      setActiveWeather('snow');
    } else if ([45, 48].includes(weatherCode)) {
      setActiveWeather('fog');
    } else {
      setActiveWeather('clear');
    }
  }, [weatherCode, manualWeatherMode]);

  // Audio Ambience Sync
  useEffect(() => {
    if ((activeWeather === 'rain' || activeWeather === 'storm') && soundEnabled) {
      setRainAmbience(true, activeWeather === 'storm' ? 0.08 : 0.04);
    } else {
      setRainAmbience(false);
    }

    return () => {
      setRainAmbience(false);
    };
  }, [activeWeather, soundEnabled]);

  // Canvas Animation Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeWeather === 'clear') return;

    const ctx = canvas.getContext('2d');
    let animationFrameId = null;
    let width = (canvas.width = canvas.parentElement.clientWidth);
    let height = (canvas.height = canvas.parentElement.clientHeight);

    const handleResize = () => {
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle States
    const dropCount = activeWeather === 'storm' ? 320 : activeWeather === 'rain' ? 180 : 100;
    const drops = [];
    const splashes = [];
    const snowflakes = [];

    if (activeWeather === 'rain' || activeWeather === 'storm') {
      for (let i = 0; i < dropCount; i++) {
        drops.push({
          x: Math.random() * width,
          y: Math.random() * height,
          length: activeWeather === 'storm' ? Math.random() * 24 + 16 : Math.random() * 18 + 10,
          speed: activeWeather === 'storm' ? Math.random() * 14 + 20 : Math.random() * 10 + 14,
          opacity: Math.random() * 0.45 + 0.35,
          angle: activeWeather === 'storm' ? 0.28 : 0.16
        });
      }
    } else if (activeWeather === 'snow') {
      for (let i = 0; i < 110; i++) {
        snowflakes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: Math.random() * 2.5 + 1.2,
          speed: Math.random() * 1.4 + 0.8,
          sway: Math.random() * 2 + 1,
          phase: Math.random() * Math.PI * 2,
          opacity: Math.random() * 0.6 + 0.3
        });
      }
    }

    // Lightning Flash Scheduler for Storm
    let lightningTimeout = null;
    if (activeWeather === 'storm') {
      const scheduleLightning = () => {
        lightningTimeout = setTimeout(() => {
          setLightningFlash(true);
          setTimeout(() => setLightningFlash(false), 90);
          setTimeout(() => {
            setLightningFlash(true);
            setTimeout(() => setLightningFlash(false), 60);
          }, 140);
          scheduleLightning();
        }, Math.random() * 7000 + 4000);
      };
      scheduleLightning();
    }

    let time = 0;

    const render = () => {
      time += 0.02;
      ctx.clearRect(0, 0, width, height);

      // 1. Render Rain / Storm
      if (activeWeather === 'rain' || activeWeather === 'storm') {
        ctx.lineWidth = activeWeather === 'storm' ? 1.6 : 1.2;

        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];

          // Rain streak
          ctx.strokeStyle = `rgba(186, 230, 253, ${d.opacity})`;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - Math.sin(d.angle) * d.length, d.y + Math.cos(d.angle) * d.length);
          ctx.stroke();

          // Move
          d.x -= Math.sin(d.angle) * d.speed;
          d.y += Math.cos(d.angle) * d.speed;

          // Hit bottom or create occasional ground splash
          if (d.y > height) {
            d.y = -d.length;
            d.x = Math.random() * (width + 200);

            // Chance to create a ripple splash
            if (splashes.length < 35 && Math.random() > 0.4) {
              splashes.push({
                x: d.x,
                y: Math.random() * height * 0.7 + height * 0.3,
                radius: 1,
                maxRadius: Math.random() * 8 + 4,
                opacity: 0.5
              });
            }
          }
        }

        // Render Splashes
        for (let j = splashes.length - 1; j >= 0; j--) {
          const s = splashes[j];
          ctx.strokeStyle = `rgba(224, 242, 254, ${s.opacity})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, s.radius * 2, s.radius * 0.7, 0, 0, Math.PI * 2);
          ctx.stroke();

          s.radius += 0.45;
          s.opacity -= 0.035;

          if (s.opacity <= 0) {
            splashes.splice(j, 1);
          }
        }
      }

      // 2. Render Snow
      else if (activeWeather === 'snow') {
        for (let i = 0; i < snowflakes.length; i++) {
          const s = snowflakes[i];
          s.y += s.speed;
          s.x += Math.sin(time + s.phase) * s.sway * 0.6;

          if (s.y > height) {
            s.y = -5;
            s.x = Math.random() * width;
          }

          ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Render Fog
      else if (activeWeather === 'fog') {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, 'rgba(203, 213, 225, 0.12)');
        gradient.addColorStop(0.5, 'rgba(148, 163, 184, 0.22)');
        gradient.addColorStop(1, 'rgba(203, 213, 225, 0.12)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (lightningTimeout) clearTimeout(lightningTimeout);
    };
  }, [activeWeather]);

  if (activeWeather === 'clear') return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-10 w-full h-full"
      />

      {/* Atmospheric Lightning Screen Flash */}
      {lightningFlash && (
        <div className="absolute inset-0 z-15 pointer-events-none bg-blue-100/25 dark:bg-white/30 backdrop-brightness-125 transition-opacity" />
      )}

      {/* Wet Road Gloss Vignette when Raining */}
      {(activeWeather === 'rain' || activeWeather === 'storm') && (
        <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_120px_rgba(2,132,199,0.18)]" />
      )}
    </>
  );
}

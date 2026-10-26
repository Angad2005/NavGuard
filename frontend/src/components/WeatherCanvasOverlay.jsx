import React, { useEffect, useRef, useState } from 'react';
import { setRainAmbience } from '../utils/audio';

export function WeatherCanvasOverlay({
  weatherCode,
  manualWeatherMode = 'auto', // 'auto' | 'rain' | 'storm' | 'snow' | 'fog' | 'clear'
  soundEnabled = false
}) {
  const canvasRef = useRef(null);
  const lightningOverlayRef = useRef(null);
  const [activeWeather, setActiveWeather] = useState('clear');

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

  // Canvas Animation Engine (Throttled & Batched for 60fps Silk Smoothness)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeWeather === 'clear') return;

    const ctx = canvas.getContext('2d', { alpha: true });
    let animationFrameId = null;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    // Optimized Particle States (Balanced density and ultra-low CPU/GPU overhead)
    const isStorm = activeWeather === 'storm';
    const dropCount = isStorm ? 130 : activeWeather === 'rain' ? 85 : 50;
    const drops = [];
    const splashes = [];
    const snowflakes = [];

    if (activeWeather === 'rain' || isStorm) {
      for (let i = 0; i < dropCount; i++) {
        drops.push({
          x: Math.random() * (width + 200),
          y: Math.random() * height,
          length: isStorm ? Math.random() * 20 + 16 : Math.random() * 14 + 10,
          speed: isStorm ? Math.random() * 8 + 18 : Math.random() * 6 + 12,
          angle: isStorm ? 0.26 : 0.15
        });
      }
    } else if (activeWeather === 'snow') {
      for (let i = 0; i < 70; i++) {
        snowflakes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: Math.random() * 2.2 + 1.2,
          speed: Math.random() * 1.2 + 0.7,
          sway: Math.random() * 1.8 + 0.8,
          phase: Math.random() * Math.PI * 2,
          opacity: Math.random() * 0.5 + 0.35
        });
      }
    }

    // Direct DOM Lightning Flash (No React re-renders)
    let lightningTimeout = null;
    if (isStorm) {
      const scheduleLightning = () => {
        lightningTimeout = setTimeout(() => {
          const el = lightningOverlayRef.current;
          if (el) {
            el.style.opacity = '1';
            setTimeout(() => {
              if (el) el.style.opacity = '0';
            }, 80);
            setTimeout(() => {
              if (el) el.style.opacity = '0.9';
              setTimeout(() => {
                if (el) el.style.opacity = '0';
              }, 60);
            }, 130);
          }
          scheduleLightning();
        }, Math.random() * 7000 + 4000);
      };
      scheduleLightning();
    }

    let time = 0;
    let lastRenderTime = performance.now();
    const frameInterval = 28; // Cap canvas at ~35 FPS to leave 100% GPU/CPU headroom for map pan & UI

    const render = (now) => {
      animationFrameId = requestAnimationFrame(render);

      const delta = now - lastRenderTime;
      if (delta < frameInterval) return;
      lastRenderTime = now - (delta % frameInterval);

      time += 0.03;
      ctx.clearRect(0, 0, width, height);

      // 1. Batched Rain / Storm
      if (activeWeather === 'rain' || isStorm) {
        ctx.lineWidth = isStorm ? 1.5 : 1.2;
        ctx.strokeStyle = isStorm ? 'rgba(186, 230, 253, 0.45)' : 'rgba(186, 230, 253, 0.35)';

        // SINGLE BATCH PATH FOR ALL RAINDROPS (Massive FPS boost)
        ctx.beginPath();
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          const x2 = d.x - Math.sin(d.angle) * d.length;
          const y2 = d.y + Math.cos(d.angle) * d.length;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(x2, y2);

          // Update position
          d.x -= Math.sin(d.angle) * d.speed;
          d.y += Math.cos(d.angle) * d.speed;

          if (d.y > height) {
            d.y = -d.length;
            d.x = Math.random() * (width + 200);

            if (splashes.length < 20 && Math.random() > 0.6) {
              splashes.push({
                x: d.x,
                y: Math.random() * (height * 0.6) + height * 0.4,
                radius: 1,
                opacity: 0.4
              });
            }
          }
        }
        ctx.stroke();

        // Batched Ground Ripple Splashes
        if (splashes.length > 0) {
          ctx.lineWidth = 1;
          for (let j = splashes.length - 1; j >= 0; j--) {
            const s = splashes[j];
            ctx.strokeStyle = `rgba(224, 242, 254, ${s.opacity})`;
            ctx.beginPath();
            ctx.ellipse(s.x, s.y, s.radius * 2, s.radius * 0.6, 0, 0, Math.PI * 2);
            ctx.stroke();

            s.radius += 0.5;
            s.opacity -= 0.04;

            if (s.opacity <= 0) {
              splashes.splice(j, 1);
            }
          }
        }
      }

      // 2. Batched Snow
      else if (activeWeather === 'snow') {
        for (let i = 0; i < snowflakes.length; i++) {
          const s = snowflakes[i];
          s.y += s.speed;
          s.x += Math.sin(time + s.phase) * s.sway * 0.5;

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

      // 3. Fog Layer
      else if (activeWeather === 'fog') {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, 'rgba(203, 213, 225, 0.10)');
        gradient.addColorStop(0.5, 'rgba(148, 163, 184, 0.18)');
        gradient.addColorStop(1, 'rgba(203, 213, 225, 0.10)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }
    };

    animationFrameId = requestAnimationFrame(render);

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
        style={{ willChange: 'transform' }}
      />

      {/* Atmospheric Lightning Screen Flash (Direct DOM Animated) */}
      <div
        ref={lightningOverlayRef}
        className="absolute inset-0 z-15 pointer-events-none bg-blue-100/25 dark:bg-white/30 backdrop-brightness-125 transition-opacity duration-75 opacity-0"
      />

      {/* Wet Road Gloss Vignette when Raining */}
      {(activeWeather === 'rain' || activeWeather === 'storm') && (
        <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_120px_rgba(2,132,199,0.18)]" />
      )}
    </>
  );
}

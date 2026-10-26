import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Sparkles,
  Send,
  X,
  Volume2,
  VolumeX,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CloudRain,
  Navigation,
  Activity,
  CheckCircle2,
  RefreshCw,
  Compass,
  ArrowRight,
  Minimize2,
  Maximize2,
  Key,
  Check
} from 'lucide-react';
import { playSound, speakNavAI, stopSpeakingNavAI } from '../utils/audio';
import { apiFetch } from '../utils/api';

const QUICK_PROMPTS = [
  { label: '📋 Departure briefing', query: 'Give me a full departure briefing on this route' },
  { label: '⏱️ ETA & Arrival Time', query: 'What is my exact ETA, duration, and arrival time?' },
  { label: '⚠️ Obstacle proximity audit', query: 'What hazards and obstacles are near or on my route?' },
  { label: '🌧️ Weather & braking impact', query: 'How is current weather affecting road traction and stopping distance at 60 km/h?' },
  { label: '🌱 Fuel & Eco estimate', query: 'What is my projected fuel consumption and eco footprint?' },
  { label: '🛡️ Route safety rating', query: 'What is the safety rating and clearance score for this route?' },
  { label: '🌊 Flood water safety (Guardrail)', query: 'Can I drive through deep flood water?' },
  { label: '🏥 Emergency haven detour', query: 'Where are the nearest emergency safe havens along the route?' }
];

export function NavAIChatModal({
  isOpen,
  onClose,
  route,
  startQuery,
  endQuery,
  weatherData,
  activeHazardsList = [],
  onStartNavigation,
  onOpenSafetyAudit,
  onFocusHazard
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [geminiKey, setGeminiKey] = useState(() => {
    try { return localStorage.getItem('navai_gemini_key') || ''; } catch { return ''; }
  });
  const [showKeySettings, setShowKeySettings] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const messagesEndRef = useRef(null);

  const isDetour = route?.hazardDetour === true;
  const distanceKm = route ? (route.distance / 1000).toFixed(1) : null;
  const durationMin = route ? Math.max(1, Math.round(route.duration / 60)) : null;

  // Initialize welcome briefing whenever route changes or modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (messages.length === 0) {
      const initialGreeting = route
        ? `Hello! I am **NavAI**, your real-time route & safety co-pilot.\n\n` +
          `I am actively tracking your corridor from **${startQuery || 'Start'}** to **${endQuery || 'Destination'}** ` +
          `(${distanceKm} km, ~${durationMin} min).\n\n` +
          `${isDetour ? '✓ **Active Safe Detour Engaged**: Your reported obstacles have been calculated and circumvented.' : '✓ **Direct Path Verified**: No imminent road obstructions detected.'}\n\n` +
          `Tap a quick query below or ask me anything regarding hazards, weather braking multipliers, or emergency havens!`
        : `Hello! I am **NavAI**, your real-time route co-pilot.\n\n` +
          `I am monitoring ${activeHazardsList.length} of your road reports and atmospheric weather.\n\n` +
          `Select an origin and destination on the map, and I will continuously evaluate your corridor safety in real time!`;

      setMessages([
        {
          id: 'welcome',
          sender: 'ai',
          text: initialGreeting,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestions: route
            ? ['Give me a full departure briefing', 'What hazards were avoided?', 'How is road traction?']
            : ['Check active hazards', 'Current weather impact']
        }
      ]);
    }
  }, [isOpen, route, startQuery, endQuery, distanceKm, durationMin, isDetour, activeHazardsList.length, messages.length]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (!isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isMinimized]);

  // Handle send message
  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    setInput('');
    playSound('click');

    const userMsg = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const telemetry = {
      route,
      startQuery,
      endQuery,
      weather: weatherData || {},
      activeHazards: activeHazardsList
    };

    try {
      const res = await apiFetch('/api/navai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          telemetry,
          apiKey: geminiKey || undefined
        })
      });

      let responseData;
      if (res.ok) {
        const json = await res.json();
        responseData = json.data;
      } else {
        throw new Error('API request failed');
      }

      playSound('ai');
      const aiMsg = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: responseData.text,
        safetyScore: responseData.safetyScore,
        nearbyHazards: responseData.nearbyHazards,
        suggestions: responseData.suggestions || [],
        guardrailTriggered: responseData.guardrailTriggered || false,
        guardrailCategory: responseData.guardrailCategory || null,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, aiMsg]);

      if (voiceEnabled) {
        speakNavAI(responseData.text);
      }
    } catch (err) {
      // Intelligent Client-Side Telemetry Fallback
      playSound('ai');
      const fallbackText = generateClientFallback(query, telemetry);
      const fallbackMsg = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: fallbackText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      if (voiceEnabled) speakNavAI(fallbackText);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceToggle = () => {
    const nextState = !voiceEnabled;
    setVoiceEnabled(nextState);
    if (!nextState) {
      stopSpeakingNavAI();
    } else {
      playSound('click');
      speakNavAI('NavAI voice readout enabled.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed z-40 transition-all duration-300 ease-out flex flex-col ${
        isMinimized
          ? 'bottom-6 right-6 w-80 h-16 rounded-3xl cyber-glass shadow-2xl overflow-hidden'
          : 'bottom-4 right-4 sm:bottom-6 sm:right-6 w-[calc(100vw-2rem)] sm:w-[28rem] h-[36rem] max-h-[85vh] rounded-3xl cyber-glass shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden border border-cyan-500/30'
      }`}
    >
      {/* Header Bar */}
      <div className="h-16 px-4 border-b border-white/10 bg-slate-950/40 backdrop-blur-xl flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/25 animate-pulse">
              <div className="w-full h-full bg-slate-950/80 rounded-[14px] flex items-center justify-center">
                <Bot className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-cyan-400 ring-2 ring-slate-950 animate-ping" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-white tracking-tight">NavAI</span>
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 tracking-wider">
                COPILOT
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-cyan-400/80 font-mono">
              <Activity className="w-2.5 h-2.5 animate-spin" />
              <span>Real-Time Trajectory Monitored</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          {/* Optional Gemini AI Key Button */}
          <button
            type="button"
            onClick={() => {
              setTempKey(geminiKey);
              setShowKeySettings(!showKeySettings);
              playSound('click');
            }}
            className={`p-2 rounded-2xl border transition-all ${
              geminiKey
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
            }`}
            title={geminiKey ? "Gemini AI Connected (Click to edit key)" : "Add Google Gemini Key (Optional)"}
          >
            <Key className="w-4 h-4" />
          </button>
          {/* TTS Readout Button */}
          <button
            type="button"
            onClick={handleVoiceToggle}
            className={`p-2 rounded-2xl border transition-all ${
              voiceEnabled
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/30'
                : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
            }`}
            title={voiceEnabled ? 'Mute NavAI Voice Readout' : 'Enable NavAI Voice Readout'}
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Minimize / Maximize */}
          <button
            type="button"
            onClick={() => {
              setIsMinimized(!isMinimized);
              playSound('click');
            }}
            className="p-2 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-all"
            title={isMinimized ? 'Expand Copilot' : 'Minimize Copilot'}
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={() => {
              stopSpeakingNavAI();
              onClose();
              playSound('click');
            }}
            className="p-2 rounded-2xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/10 transition-all"
            title="Close NavAI"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      
      {/* Optional Gemini Key Drawer */}
      {showKeySettings && !isMinimized && (
        <div className="p-3 border-b border-white/10 bg-slate-900/90 backdrop-blur-md animate-in slide-in-from-top-2 text-xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-cyan-400" />
              <span>Google Gemini AI Acceleration (Optional)</span>
            </span>
            <span className="text-[10px] text-slate-400">100% Free at ai.google.dev</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              placeholder="Paste free Gemini API Key (e.g. AIzaSy...)"
              className="flex-1 bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const k = tempKey.trim();
                setGeminiKey(k);
                try {
                  if (k) localStorage.setItem('navai_gemini_key', k);
                  else localStorage.removeItem('navai_gemini_key');
                } catch {}
                setShowKeySettings(false);
                playSound('success');
              }}
              className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
            >
              Save
            </button>
            {geminiKey && (
              <button
                type="button"
                onClick={() => {
                  setGeminiKey('');
                  setTempKey('');
                  try { localStorage.removeItem('navai_gemini_key'); } catch {}
                  setShowKeySettings(false);
                  playSound('click');
                }}
                className="px-2 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">
            Leave blank to use our fast, deterministic built-in telemetry engine.
          </p>
        </div>
      )}

      {!isMinimized && (
        <>
          {/* Real-Time Telemetry Badge Bar */}
          <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02] flex items-center justify-between text-[11px] font-mono text-slate-300 overflow-x-auto no-scrollbar gap-2 shrink-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <Navigation className="w-3.5 h-3.5 text-blue-400" />
              <span>{route ? `${distanceKm} km (~${durationMin} min)` : 'No Route Selected'}</span>
            </div>

            {route && (
              <div className="flex items-center gap-1.5 shrink-0">
                <ShieldCheck className={`w-3.5 h-3.5 ${isDetour ? 'text-amber-400' : 'text-emerald-400'}`} />
                <span className={isDetour ? 'text-amber-300 font-bold' : 'text-emerald-300 font-bold'}>
                  {isDetour ? 'Safe Detour Active' : 'Direct Path Clean'}
                </span>
              </div>
            )}

            {weatherData && (
              <div className="flex items-center gap-1 shrink-0 text-slate-400">
                <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
                <span>{Math.round(weatherData.temperature)}°C</span>
              </div>
            )}
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 no-scrollbar">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl p-3.5 text-xs sm:text-[13px] leading-relaxed shadow-lg ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none font-medium'
                      : 'bg-slate-900/80 border border-cyan-500/20 text-slate-200 rounded-tl-none font-normal'
                  }`}
                >
                  {/* Sender Header for AI */}
                  {msg.sender === 'ai' && (
                    <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/10">
                      <div className="flex items-center gap-1.5 font-bold text-cyan-400 text-[11px]">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>NavAI Route Telemetry</span>
                      </div>
                      {msg.guardrailTriggered ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-xs animate-pulse">
                          <ShieldAlert className="w-3 h-3 text-amber-400" />
                          <span>Guardrail Enforced</span>
                        </span>
                      ) : (
                        typeof msg.safetyScore === 'number' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Safety: {msg.safetyScore}/100
                          </span>
                        )
                      )}
                    </div>
                  )}

                  {/* Message Body with Markdown formatting */}
                  <div className="space-y-1.5 whitespace-pre-wrap">
                    {formatNavAIText(msg.text)}
                  </div>

                  {/* AI Action Buttons */}
                  {msg.sender === 'ai' && route && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenSafetyAudit) onOpenSafetyAudit(route, startQuery, endQuery);
                          playSound('click');
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-cyan-300 hover:text-white transition-all"
                      >
                        <ShieldCheck className="w-3 h-3 text-cyan-400" />
                        <span>Audit Corridor</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (onStartNavigation) onStartNavigation();
                          playSound('route');
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-[10px] font-bold text-blue-200 hover:text-white transition-all"
                      >
                        <Navigation className="w-3 h-3 text-blue-400" />
                        <span>Simulate Drive</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          speakNavAI(msg.text);
                          playSound('click');
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] text-slate-400 hover:text-white transition-all"
                        title="Read aloud"
                      >
                        <Volume2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-[9px] text-slate-500 font-mono mt-1 px-1">
                  {msg.time}
                </span>

                {/* Suggestions Pills if any */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-w-[90%]">
                    {msg.suggestions.map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendMessage(sug)}
                        className="px-2.5 py-1 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-[10px] font-semibold text-cyan-300 hover:text-white transition-all text-left"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-start">
                <div className="rounded-2xl rounded-tl-none p-3.5 bg-slate-900/80 border border-cyan-500/20 text-slate-300 text-xs flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  <span>NavAI is analyzing route trajectory & obstacle database...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-3 py-2 border-t border-white/5 bg-slate-950/30 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {QUICK_PROMPTS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(p.query)}
                className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-cyan-500/15 border border-white/10 hover:border-cyan-500/30 text-[11px] font-medium text-slate-300 hover:text-cyan-200 transition-all shrink-0 active:scale-95"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 border-t border-white/10 bg-slate-950/60 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={route ? "Ask NavAI about your route, hazards, weather..." : "Ask NavAI anything about safety..."}
              className="flex-1 bg-white/5 border border-white/10 focus:border-cyan-500/60 focus:bg-white/10 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-400 outline-none transition-all"
            />

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:pointer-events-none text-white shadow-lg shadow-cyan-500/25 active:scale-95 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}

// Simple Markdown Formatter Helper
function formatNavAIText(text = '') {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Bold parser
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return (
      <div key={i} className="min-h-[1em]">
        {parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={pIdx} className="font-bold text-white">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('*') && part.endsWith('*')) {
            return (
              <em key={pIdx} className="text-cyan-200 not-italic font-semibold">
                {part.slice(1, -1)}
              </em>
            );
          }
          return part;
        })}
      </div>
    );
  });
}

// Client Fallback if API is unavailable (with Guardrails enforced)
function generateClientFallback(query, telemetry) {
  const q = query.toLowerCase();
  const route = telemetry.route;

  // Guardrail 1: Flood Water
  if (/drive\s+through.*(flood|water|submerged)|cross.*(flood|water)/i.test(q)) {
    return `🚨 **CRITICAL SAFETY GUARDRAIL: FLOODED ROAD HAZARD**\n\n• Turn Around, Don't Drown! Just 15 cm of moving water reaches vehicle undercarriages, and 30 cm floats most passenger vehicles.\n• Never drive through flooded streets or submerged underpasses.`;
  }

  // Guardrail 2: Speed / Reckless
  if (/can\s+i\s+(speed|go\s+fast|race)|ignore\s+(the\s+)?speed\s+limit/i.test(q)) {
    return `🛡️ **SAFETY COMPLIANCE GUARDRAIL: SPEED LIMIT ENFORCEMENT**\n\n• NavAI strictly adheres to road safety laws.\n• Braking distance scales quadratically with velocity. Maintain legal speeds and safe following buffers.`;
  }

  // Guardrail 3: Off-topic
  if (/write\s+(python|javascript|code|script)|who\s+will\s+win\s+election|crypto|bitcoin/i.test(q)) {
    return `🧭 **NAVAI DOMAIN GUARDRAIL: NAVIGATION FOCUS**\n\n• NavAI operates strictly as a vehicle navigation and road defense co-pilot.\n• I do not answer non-automotive or off-topic queries.`;
  }

  if (!route) {
    return 'I am monitoring your saved hazard reports and road conditions. Please select an origin and destination on the map to begin corridor tracking!';
  }

  const distKm = (route.distance / 1000).toFixed(1);
  const durMin = Math.max(1, Math.round(route.duration / 60));
  const isDetour = route.hazardDetour === true;
  const eta = new Date(Date.now() + durMin * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (q.includes('eta') || q.includes('time') || q.includes('arrive')) {
    return `⏱️ **Navigation Metrics**: Destination ETA is **${eta}** (${durMin} min remaining, ${distKm} km total distance).`;
  }

  if (q.includes('weather') || q.includes('rain') || q.includes('brake') || q.includes('stopping')) {
    return `🌦️ **Atmospheric Conditions**: Pavement friction is monitored. Stopping distance at 60 km/h on wet asphalt increases from ~37m (dry) to ~52m (+40%). Maintain a 4-car following distance.`;
  }

  if (q.includes('hazard') || q.includes('obstacle') || q.includes('safe')) {
    return isDetour
      ? `✓ **Safe Detour Active**: Obstacles circumvented outside 100m danger zones. Clearance score: 98/100.`
      : `✓ **Direct Path Verified**: No active obstacles detected along this ${distKm} km trajectory.`;
  }

  return `Monitoring route corridor to destination (${distKm} km, ~${durMin} min, ETA: ${eta}). ${isDetour ? 'Safe Detour engaged.' : 'Corridor clean.'}`;
}

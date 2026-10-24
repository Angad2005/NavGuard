import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Sparkles,
  Send,
  Volume2,
  VolumeX,
  ShieldCheck,
  ShieldAlert,
  Navigation,
  Activity,
  Maximize2,
  RefreshCw,
  Compass
} from 'lucide-react';
import { playSound, speakNavAI, stopSpeakingNavAI } from '../utils/audio';

const QUICK_PROMPTS = [
  '📋 Departure briefing',
  '⏱️ ETA & arrival time',
  '⚠️ Hazards avoided?',
  '🌧️ Braking distance at 60 km/h',
  '🌱 Fuel consumption',
  '🌊 Flood safety (Guardrail)',
  '🛡️ Route safety rating'
];

export function SidebarNavAIPanel({
  route,
  startQuery,
  endQuery,
  weatherData,
  activeHazardsList = [],
  onStartNavigation,
  onOpenSafetyAudit,
  onPopOutModal
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const messagesEndRef = useRef(null);

  const isDetour = route?.hazardDetour === true;
  const distanceKm = route ? (route.distance / 1000).toFixed(1) : null;
  const durationMin = route ? Math.max(1, Math.round(route.duration / 60)) : null;

  useEffect(() => {
    if (messages.length === 0) {
      const initialGreeting = route
        ? `Hello! I am **NavAI**, your route safety co-pilot.\n\n` +
          `Monitoring corridor to **${endQuery || 'Destination'}** (${distanceKm} km, ~${durationMin} min).\n` +
          `${isDetour ? '✓ Active Safe Detour avoiding known hazards.' : '✓ Direct path clear.'}\n\n` +
          `Ask me anything about route conditions, road friction, or hazards!`
        : `Hello! I am **NavAI**, your real-time safety co-pilot.\n\n` +
          `I am monitoring ${activeHazardsList.length} road obstacles. Pick a destination to begin real-time corridor tracking!`;

      setMessages([
        {
          id: 'welcome',
          sender: 'ai',
          text: initialGreeting,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestions: route
            ? ['Give me a full departure briefing', 'What hazards were avoided?']
            : ['Check active hazards', 'Current weather impact']
        }
      ]);
    }
  }, [route, startQuery, endQuery, distanceKm, durationMin, isDetour, activeHazardsList.length, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      const savedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('navai_gemini_key') : null;
      const res = await fetch('/api/navai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          telemetry,
          apiKey: savedKey || undefined
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
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, aiMsg]);
      if (voiceEnabled) speakNavAI(responseData.text);
    } catch {
      // Fallback
      playSound('ai');
      const fallbackText = route
        ? `NavAI Telemetry: Route to ${endQuery || 'Destination'} is ${distanceKm} km (~${durationMin} min). ${isDetour ? 'Safe Detour is active bypassing hazards.' : 'Clear path verified.'}`
        : `NavAI: Ready. Select an origin and destination to calculate real-time corridor metrics.`;

      setMessages((prev) => [
        ...prev,
        {
          id: `ai_${Date.now()}`,
          sender: 'ai',
          text: fallbackText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      if (voiceEnabled) speakNavAI(fallbackText);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (!next) {
      stopSpeakingNavAI();
    } else {
      playSound('click');
      speakNavAI('NavAI voice active.');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] space-y-2.5 animate-in fade-in duration-200">
      {/* Telemetry Header Card */}
      <div className="p-3 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-blue-950/40 to-slate-900/60 border border-cyan-500/30 flex items-center justify-between gap-2 shrink-0 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/25">
              <Bot className="w-4 h-4 text-cyan-200" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-slate-900 animate-ping" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="font-extrabold text-xs text-white">NavAI Copilot</h4>
              <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                LIVE
              </span>
            </div>
            <span className="text-[10px] text-cyan-300/80 font-mono">
              {route ? `${distanceKm} km • ${isDetour ? 'Detour Active' : 'Optimal Direct'}` : 'Awaiting Route'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleVoice}
            className={`p-1.5 rounded-xl border transition-all ${
              voiceEnabled
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
            }`}
            title={voiceEnabled ? 'Mute voice' : 'Enable voice readout'}
          >
            {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {onPopOutModal && (
            <button
              type="button"
              onClick={onPopOutModal}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-all"
              title="Pop out to floating window"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 no-scrollbar text-xs">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl p-3 leading-relaxed shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none font-medium'
                  : 'bg-slate-900/90 border border-white/10 text-slate-200 rounded-tl-none font-normal'
              }`}
            >
              {msg.sender === 'ai' && (
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10 text-[10px] text-cyan-400 font-bold">
                  <div className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>NavAI Telemetry</span>
                  </div>
                  {msg.guardrailTriggered ? (
                    <span className="font-mono text-amber-400 flex items-center gap-1 bg-amber-500/15 px-1.5 py-0.2 rounded border border-amber-500/30">
                      <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
                      <span>Guardrail</span>
                    </span>
                  ) : (
                    typeof msg.safetyScore === 'number' && (
                      <span className="font-mono text-emerald-400">Score: {msg.safetyScore}</span>
                    )
                  )}
                </div>
              )}

              <div className="space-y-1 whitespace-pre-wrap">
                {msg.text.split('\n').map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>

            {/* Quick Suggestions below response */}
            {msg.suggestions && msg.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5 max-w-[95%]">
                {msg.suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(s)}
                    className="px-2 py-0.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-[9px] font-semibold text-cyan-300 hover:text-white transition-all text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-slate-900/80 border border-cyan-500/20 text-slate-400 text-xs">
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            <span>Analyzing corridor telemetry...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1 shrink-0">
        {QUICK_PROMPTS.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(p)}
            className="px-2 py-1 rounded-xl bg-white/5 hover:bg-cyan-500/20 border border-white/10 text-[10px] text-slate-300 hover:text-white shrink-0 transition-all"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="flex items-center gap-1.5 pt-1 border-t border-white/10 shrink-0"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask NavAI about route..."
          className="flex-1 bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 outline-none transition-all"
        />

        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold disabled:opacity-40 transition-all shadow-md"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}

import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export function Toast({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarn = toast.type === 'warn' || toast.type === 'warning';

        const borderClass = isSuccess
          ? 'border-emerald-500/30 dark:border-emerald-500/40'
          : isError
          ? 'border-rose-500/30 dark:border-rose-500/40'
          : isWarn
          ? 'border-amber-500/30 dark:border-amber-500/40'
          : 'border-blue-500/30 dark:border-blue-500/40';

        const bgClass = isSuccess
          ? 'bg-emerald-50/90 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-100'
          : isError
          ? 'bg-rose-50/90 dark:bg-rose-950/80 text-rose-900 dark:text-rose-100'
          : isWarn
          ? 'bg-amber-50/90 dark:bg-amber-950/80 text-amber-900 dark:text-amber-100'
          : 'bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-xl shadow-xl backdrop-blur-md border ${borderClass} ${bgClass} transition-all duration-200 animate-in fade-in slide-in-from-bottom-2`}
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
              {isError && <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />}
              {isWarn && <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />}
              {!isSuccess && !isError && !isWarn && (
                <Info className="w-5 h-5 text-blue-500 shrink-0" />
              )}
              <p className="text-sm font-medium leading-snug truncate">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

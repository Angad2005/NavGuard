import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

export function Toast({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => {
        let Icon = CheckCircle;
        let iconColor = 'var(--success)';
        if (toast.type === 'error') {
          Icon = XCircle;
          iconColor = 'var(--danger)';
        } else if (toast.type === 'warning') {
          Icon = AlertTriangle;
          iconColor = 'var(--warning)';
        } else if (toast.type === 'info') {
          Icon = Info;
          iconColor = 'var(--info)';
        }

        return (
          <div
            key={toast.id}
            className="toast-item"
            onClick={() => onDismiss(toast.id)}
            style={{ cursor: 'pointer' }}
          >
            <Icon size={18} style={{ color: iconColor, flexShrink: 0 }} />
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}

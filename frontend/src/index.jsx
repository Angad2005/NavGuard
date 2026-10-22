import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './context/ThemeContext';
import { SessionProvider } from './context/SessionContext';
import { HazardProvider } from './context/HazardContext';
import { App } from './App';
import './styles/unified.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <SessionProvider>
          <HazardProvider>
            <App />
          </HazardProvider>
        </SessionProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}

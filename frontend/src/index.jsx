import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './context/ThemeContext';
import { HazardProvider } from './context/HazardContext';
import { App } from './App';
import './styles/index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <HazardProvider>
          <App />
        </HazardProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}

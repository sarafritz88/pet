import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import SettingsPanel from './SettingsPanel';
import ErrorBoundary from './ErrorBoundary';
import './index.css';

const root = createRoot(document.getElementById('root'));

// Settings window loads the same bundle with a #settings hash
if (window.location.hash === '#settings') {
  root.render(
    <ErrorBoundary>
      <SettingsPanel />
    </ErrorBoundary>
  );
} else {
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

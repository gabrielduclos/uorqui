import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './pwaInstallPrompt';
import App from './App';
import { installRateLimitDiagnostics } from './api429Diagnostics';
import './styles.css';
import './ui-kit/sprintrix.css';

// Capture 429 responses before the app issues its first API request.
installRateLimitDiagnostics();

const target = document.getElementById('root');
if (!target) throw new Error('Missing #root element');

createRoot(target).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress known third-party browser extension errors (e.g. translation/language detection on local pages)
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || String(event.reason || '');
  if (msg.includes('Language detection is not supported for this page') || msg.includes('Language detection')) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

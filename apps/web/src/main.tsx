import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const target = document.getElementById('root');
if (!target) throw new Error('Missing #root element');

createRoot(target).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

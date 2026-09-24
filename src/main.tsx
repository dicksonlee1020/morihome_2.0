import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// Noto Sans TC 喺 JS 入面加：放喺 CSS @import 會變成 script-blocking stylesheet，
// 網絡慢（或者擋咗 Google Fonts）時成個 app 等住唔行。載唔到就用系統字。
const font = document.createElement('link');
font.rel = 'stylesheet';
font.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap';
document.head.appendChild(font);

const rootEl = document.getElementById('root')!;
rootEl.setAttribute('data-mounted', '1');
createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

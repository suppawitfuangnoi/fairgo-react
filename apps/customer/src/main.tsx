import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import Toaster from './components/Toaster';
import ErrorBoundary from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster />
    </ErrorBoundary>
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, I18nProvider } from '@onfire/ui';
import App from './App';
import './index.css';
import { translations } from './locales';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider translations={translations}>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);

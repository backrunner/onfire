import { hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, I18nProvider } from '@onfire/ui';
import App from './App';
import { translations } from './locales';
import './styles/index.css';

function hydrate() {
  const root = document.getElementById('root');
  if (!root) {
    console.error('Root element not found');
    return;
  }

  hydrateRoot(
    root,
    <BrowserRouter>
      <ThemeProvider>
        <I18nProvider translations={translations}>
          <App />
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  );

  console.log('✅ Client hydration complete');
}

// 等待 DOM 加载完成
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrate);
} else {
  hydrate();
}

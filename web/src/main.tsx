import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AssetsProvider } from './assets';
import { AuthProvider } from './auth';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './theme';
import { ToastProvider } from './components/Toast';
import './index.css';

// 不使用 StrictMode：模拟器挂载时会被双调用导致重复加载内核
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <AssetsProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </AssetsProvider>
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  </BrowserRouter>,
);

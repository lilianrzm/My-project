import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/dm-serif-display/latin-400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';
import { initDatabase, requestPersistentStorage } from './db/repo';
import { DataProvider } from './state/data';
import { FeedbackProvider, UIProvider } from './state/ui';
import { App } from './App';
import { StorageError } from './components/StorageError';

const root = createRoot(document.getElementById('root')!);

initDatabase()
  .then(() => {
    // Se solicita, pero el navegador puede no concederlo: nunca se asume.
    void requestPersistentStorage();
    root.render(
      <StrictMode>
        <FeedbackProvider>
          <UIProvider>
            <DataProvider>
              <App />
            </DataProvider>
          </UIProvider>
        </FeedbackProvider>
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    console.error(err);
    root.render(<StorageError error={err} />);
  });

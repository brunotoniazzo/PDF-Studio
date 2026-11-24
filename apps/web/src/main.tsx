import React from 'react';
import ReactDOM from 'react-dom/client';
import { PdfStudioApp } from '@pdf-studio/ui';
import { createBrowserPlatformAdapter } from './adapters/browserPlatformAdapter';
import './styles.css';

const platformAdapter = createBrowserPlatformAdapter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PdfStudioApp platform={platformAdapter} />
  </React.StrictMode>
);

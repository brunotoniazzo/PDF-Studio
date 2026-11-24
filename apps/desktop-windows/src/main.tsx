import React from 'react';
import ReactDOM from 'react-dom/client';
import { PdfStudioApp } from '@pdf-studio/ui';
import { createDesktopWindowsAdapter } from './adapters/desktopWindowsAdapter';
import './styles.css';

const desktopAdapter = createDesktopWindowsAdapter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PdfStudioApp platform={desktopAdapter} />
  </React.StrictMode>
);

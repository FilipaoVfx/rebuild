import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FocusStyleManager } from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import '@blueprintjs/select/lib/css/blueprint-select.css';
import '@blueprintjs/table/lib/css/table.css';
import './styles.css';
import App from './App';

FocusStyleManager.onlyShowFocusOnTabs();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

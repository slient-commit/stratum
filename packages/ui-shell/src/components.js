// Component registry — auto-discovers module UI components at build time
// Modules ship their own pages in packages/<module>/ui/*.jsx
// No manual registration needed — just add .jsx files to your module's ui/ folder

import { lazy } from 'react';

// Shell-owned pages (always present)
const components = {
  LoginPage: lazy(() => import('./pages/LoginPage')),
};

// Auto-discover module UI components: packages/*/ui/*.jsx
const modulePages = import.meta.glob('../../*/ui/*.jsx');

for (const [path, loader] of Object.entries(modulePages)) {
  const name = path.split('/').pop().replace('.jsx', '');
  components[name] = lazy(loader);
}

export default components;

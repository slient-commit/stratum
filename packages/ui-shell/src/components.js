// Component registry — maps component names from plugin metadata to React components
// When creating a new module with UI, add its components here

import { lazy } from 'react';

const components = {
  LoginPage: lazy(() => import('./pages/LoginPage')),
  DashboardPage: lazy(() => import('./pages/DashboardPage')),
  RolesPage: lazy(() => import('./pages/RolesPage')),
};

export default components;

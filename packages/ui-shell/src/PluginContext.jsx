import { createContext, useContext, useEffect, useState } from 'react';

const PluginContext = createContext({ plugins: [], routes: [], nav: [], loading: true });

export function PluginProvider({ children }) {
  const [state, setState] = useState({ plugins: [], routes: [], nav: [], loading: true });

  useEffect(() => {
    fetch('/api/__plugins')
      .then((res) => res.json())
      .then((plugins) => {
        const routes = [];
        const nav = [];

        for (const plugin of plugins) {
          if (plugin.routes) {
            for (const route of plugin.routes) {
              routes.push({ ...route, module: plugin.name });
            }
          }
          if (plugin.nav) {
            for (const item of plugin.nav) {
              nav.push({ ...item, module: plugin.name });
            }
          }
        }

        setState({ plugins, routes, nav, loading: false });
      })
      .catch((err) => {
        console.error('Failed to load plugins:', err);
        setState((s) => ({ ...s, loading: false }));
      });
  }, []);

  return <PluginContext.Provider value={state}>{children}</PluginContext.Provider>;
}

export function usePlugins() {
  return useContext(PluginContext);
}

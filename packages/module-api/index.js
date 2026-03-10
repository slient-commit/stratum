const express = require('express');
const cors = require('cors');

module.exports = {
  name: 'module-api',
  version: '1.0.0',
  dependencies: [],

  async register(context) {
    const app = express();

    app.use(express.json());

    if (context.config.cors !== false) {
      app.use(cors());
    }

    // Let other modules mount their routers
    context.services.register('api.app', app);
    context.services.register('api.registerRouter', (prefix, router) => {
      app.use(prefix, router);
      context.logger.info(`Mounted router at ${prefix}`);
    });

    this._app = app;
    context.logger.info('Registered');
  },

  async init() {},

  async start(context) {
    const app = this._app;

    // Serve aggregated UI plugin metadata
    const uiPlugins = context.services.get('core.uiPlugins');
    app.get('/api/__plugins', (req, res) => {
      res.json(uiPlugins);
    });

    // Health check
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    const port = context.config.port || 3001;
    this._server = app.listen(port, () => {
      context.logger.info(`HTTP server listening on port ${port}`);
    });
  },

  async stop(context) {
    if (this._server) {
      await new Promise((resolve) => this._server.close(resolve));
      context.logger.info('HTTP server stopped');
    }
  },

  async destroy() {},
};

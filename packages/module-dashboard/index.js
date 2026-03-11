module.exports = {
  name: 'module-dashboard',
  version: '2.0.0',
  dependencies: ['module-api', 'module-auth'],

  ui: {
    routes: [{ path: '/dashboard', component: 'DashboardPage' }],
    nav: [{ label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' }],
  },

  async register(context) {
    context.logger.info('Registered');
  },

  async init() {},

  async start(context) {
    const registerRouter = context.services.get('api.registerRouter');
    const requireAuth = context.services.get('auth.requireAuth');
    const { Router } = require('express');
    const router = Router();

    router.get('/stats', requireAuth, async (req, res) => {
      const db = context.services.get('db');
      const users = await db.count('users');
      const roles = await db.count('roles');

      res.json({
        users,
        roles,
        uptime: process.uptime(),
      });
    });

    registerRouter('/api/dashboard', router);
  },

  async stop() {},
  async destroy() {},
};

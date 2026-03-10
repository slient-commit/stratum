module.exports = {
  name: 'module-dashboard',
  version: '1.0.0',
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

    router.get('/stats', requireAuth, (req, res) => {
      const db = context.services.get('db');
      const userCount = db.get('SELECT COUNT(*) as count FROM users');
      const roleCount = db.get('SELECT COUNT(*) as count FROM roles');

      res.json({
        users: userCount.count,
        roles: roleCount.count,
        uptime: process.uptime(),
      });
    });

    registerRouter('/api/dashboard', router);
  },

  async stop() {},
  async destroy() {},
};

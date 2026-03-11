const createRbacRoutes = require('./routes');

module.exports = {
  name: 'module-rbac',
  version: '2.0.0',
  dependencies: ['module-db-sqlite', 'module-api', 'module-auth'],

  ui: {
    routes: [{ path: '/roles', component: 'RolesPage' }],
    nav: [{ label: 'Roles', path: '/roles', icon: 'Shield' }],
  },

  async register(context) {
    // Expose a middleware that checks user role
    context.services.register('rbac.requireRole', (roleName) => {
      return async (req, res, next) => {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        const db = context.services.get('db');
        const role = await db.select('roles', { name: roleName }, ['id']);
        const hasRole = role
          ? await db.exists('user_roles', { user_id: req.user.id, role_id: role.id })
          : false;
        if (!hasRole) {
          return res.status(403).json({ error: `Role "${roleName}" required` });
        }
        next();
      };
    });

    context.logger.info('Registered');
  },

  async init(context) {
    const db = context.services.get('db');

    await db.createTable('roles', {
      id: { type: 'integer', primaryKey: true, autoIncrement: true },
      name: { type: 'text', unique: true, required: true },
      description: { type: 'text', default: '' },
    });

    await db.createTable('permissions', {
      id: { type: 'integer', primaryKey: true, autoIncrement: true },
      name: { type: 'text', unique: true, required: true },
      description: { type: 'text', default: '' },
    });

    await db.createTable('role_permissions', {
      role_id: { type: 'integer', required: true, references: { table: 'roles', column: 'id' } },
      permission_id: { type: 'integer', required: true, references: { table: 'permissions', column: 'id' } },
    });

    await db.createTable('user_roles', {
      user_id: { type: 'integer', required: true, references: { table: 'users', column: 'id' } },
      role_id: { type: 'integer', required: true, references: { table: 'roles', column: 'id' } },
    });

    // Seed default roles
    const defaultRole = context.config.defaultRole || 'user';
    await db.upsert('roles', { name: defaultRole, description: 'Default user role' }, ['name']);
    await db.upsert('roles', { name: 'admin', description: 'Administrator role' }, ['name']);

    context.logger.info('RBAC tables ready');
  },

  async start(context) {
    const db = context.services.get('db');
    const registerRouter = context.services.get('api.registerRouter');
    const requireAuth = context.services.get('auth.requireAuth');

    // Auto-assign default role on user creation
    const defaultRole = context.config.defaultRole || 'user';
    context.events.on('user.created', async (user) => {
      const role = await db.select('roles', { name: defaultRole }, ['id']);
      if (role) {
        await db.upsert('user_roles', { user_id: user.id, role_id: role.id }, [
          'user_id',
          'role_id',
        ]);
        context.logger.info(`Assigned role "${defaultRole}" to user ${user.username}`);
      }
    });

    const router = createRbacRoutes(db, requireAuth);
    registerRouter('/api/rbac', router);
  },

  async stop() {},
  async destroy() {},
};

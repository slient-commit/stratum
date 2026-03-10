const createRbacRoutes = require('./routes');

module.exports = {
  name: 'module-rbac',
  version: '1.0.0',
  dependencies: ['module-db-sqlite', 'module-api', 'module-auth'],

  ui: {
    routes: [{ path: '/roles', component: 'RolesPage' }],
    nav: [{ label: 'Roles', path: '/roles', icon: 'Shield' }],
  },

  async register(context) {
    // Expose a middleware that checks user role
    context.services.register('rbac.requireRole', (roleName) => {
      return (req, res, next) => {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        const db = context.services.get('db');
        const role = db.get(
          `SELECT 1 FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = ? AND r.name = ?`,
          [req.user.id, roleName]
        );
        if (!role) {
          return res.status(403).json({ error: `Role "${roleName}" required` });
        }
        next();
      };
    });

    context.logger.info('Registered');
  },

  async init(context) {
    const db = context.services.get('db');

    db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INTEGER NOT NULL,
        permission_id INTEGER NOT NULL,
        PRIMARY KEY (role_id, permission_id),
        FOREIGN KEY (role_id) REFERENCES roles(id),
        FOREIGN KEY (permission_id) REFERENCES permissions(id)
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        user_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, role_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (role_id) REFERENCES roles(id)
      );
    `);

    // Seed default roles
    const defaultRole = context.config.defaultRole || 'user';
    db.run('INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)', [
      defaultRole,
      'Default user role',
    ]);
    db.run('INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)', [
      'admin',
      'Administrator role',
    ]);

    context.logger.info('RBAC tables ready');
  },

  async start(context) {
    const db = context.services.get('db');
    const registerRouter = context.services.get('api.registerRouter');
    const requireAuth = context.services.get('auth.requireAuth');

    // Auto-assign default role on user creation
    const defaultRole = context.config.defaultRole || 'user';
    context.events.on('user.created', (user) => {
      const role = db.get('SELECT id FROM roles WHERE name = ?', [defaultRole]);
      if (role) {
        db.run('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
          user.id,
          role.id,
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

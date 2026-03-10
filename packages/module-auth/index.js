const jwt = require('jsonwebtoken');
const createAuthRoutes = require('./routes');

module.exports = {
  name: 'module-auth',
  version: '1.0.0',
  dependencies: ['module-db-sqlite', 'module-api'],

  ui: {
    routes: [
      { path: '/login', component: 'LoginPage', public: true },
    ],
    nav: [],
  },

  async register(context) {
    const secret = context.config.jwtSecret || 'change-me';

    // Expose auth services for other modules
    context.services.register('auth.verifyToken', (token) => {
      return jwt.verify(token, secret);
    });

    context.services.register('auth.requireAuth', (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      try {
        req.user = jwt.verify(authHeader.split(' ')[1], secret);
        next();
      } catch {
        res.status(401).json({ error: 'Invalid token' });
      }
    });

    context.logger.info('Registered');
  },

  async init(context) {
    const db = context.services.get('db');

    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    context.logger.info('Users table ready');
  },

  async start(context) {
    const db = context.services.get('db');
    const registerRouter = context.services.get('api.registerRouter');
    const router = createAuthRoutes(db, context.config, context.events);
    registerRouter('/api/auth', router);
  },

  async stop() {},
  async destroy() {},
};

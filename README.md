# Stratum

A modular core framework for building domain-specific applications with Node.js and React.

Stratum does almost nothing on its own. Instead, it provides a **plugin system** where every capability — database, authentication, authorization, API layer, UI — is a module that can be added, removed, enabled, or disabled through a single config file.

Build once, adapt everywhere.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start the backend (Express API on port 3001)
node index.js

# Start the frontend (React dev server on port 3000)
npm run dev:ui
```

Register a user and log in at `http://localhost:3000`.

---

## Project Structure

```
Stratum/
├── index.js                 # Boot entry point
├── stratum.config.js        # Module configuration (enable/disable, options)
└── packages/
    ├── core/                # Kernel, module loader, lifecycle, event bus, services
    ├── module-db-sqlite/    # SQLite database adapter
    ├── module-api/          # Express REST API server
    ├── module-auth/         # JWT authentication (register, login, sessions)
    ├── module-rbac/         # Role-based access control
    ├── module-dashboard/    # Sample dashboard with stats
    ├── module-firebase/     # Full Firebase suite (Firestore, Auth, Storage)
    └── ui-shell/            # React + Vite frontend shell
```

---

## How It Works

### The Kernel

The Kernel is the orchestrator. On boot it:

1. Reads `stratum.config.js` to find which modules are enabled
2. Loads each module and validates its contract
3. Topologically sorts modules by their declared dependencies
4. Runs lifecycle phases in order: **register** → **init** → **start**
5. On shutdown: **stop** → **destroy** (in reverse order)

### Module Contract

Every module exports a simple object:

```js
module.exports = {
  name: 'my-module',
  version: '1.0.0',
  dependencies: ['module-api'],  // other module names this depends on

  async register(context) { },   // declare services
  async init(context) { },       // connect resources, run migrations
  async start(context) { },      // mount routes, go live
  async stop(context) { },       // graceful shutdown
  async destroy(context) { },    // cleanup resources
};
```

### Context Object

Every lifecycle method receives a `context` with:

| Property | Description |
|----------|-------------|
| `config` | This module's options from `stratum.config.js` |
| `services` | Service registry — `register(name, impl)`, `get(name)`, `has(name)` |
| `events` | Event bus — `emit(event, data)`, `on(event, handler)` |
| `logger` | Scoped logger — `info()`, `warn()`, `error()`, `debug()` |

### Inter-Module Communication

**Services** — modules expose named services that others consume:

```js
// module-auth registers:
context.services.register('auth.requireAuth', middleware);

// module-rbac consumes:
const requireAuth = context.services.get('auth.requireAuth');
```

**Events** — async pub/sub for decoupled communication:

```js
// module-auth emits:
await context.events.emit('user.created', user);

// module-rbac listens:
context.events.on('user.created', (user) => assignDefaultRole(user));
```

---

## Configuration

All module configuration lives in `stratum.config.js`:

```js
module.exports = {
  modules: {
    '@stratum/module-db-sqlite': {
      enabled: true,
      options: { filename: './data/stratum.db' },
    },
    '@stratum/module-api': {
      enabled: true,
      options: { port: 3001, cors: true },
    },
    '@stratum/module-auth': {
      enabled: true,
      options: { jwtSecret: 'your-secret-here', tokenExpiry: '24h' },
    },
    '@stratum/module-rbac': {
      enabled: true,
      options: { defaultRole: 'user' },
    },
    '@stratum/module-dashboard': {
      enabled: true,
    },
    '@stratum/module-firebase': {
      enabled: false,
      options: { credential: './service-account.json' },
    },
  },
};
```

Set `enabled: false` to disable any module without removing code.

---

## Built-in Modules

### module-db-sqlite

SQLite database adapter using `better-sqlite3`.

**Services registered:** `db`

| Method | Description |
|--------|-------------|
| `db.run(sql, params)` | Execute INSERT/UPDATE/DELETE, returns `{ lastInsertRowid, changes }` |
| `db.get(sql, params)` | Fetch single row, returns object or `undefined` |
| `db.all(sql, params)` | Fetch all rows, returns array |
| `db.exec(sql)` | Execute raw SQL (DDL, multi-statement) |
| `db.raw` | Underlying `better-sqlite3` instance |

**Config options:**

| Option | Default | Description |
|--------|---------|-------------|
| `filename` | `./data/stratum.db` | Path to SQLite database file |

---

### module-api

Express HTTP server with CORS support.

**Services registered:** `api.app`, `api.registerRouter`

| Service | Description |
|---------|-------------|
| `api.app` | The Express app instance |
| `api.registerRouter(prefix, router)` | Mount an Express router at a prefix |

**Built-in endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/__plugins` | UI plugin metadata (used by frontend) |

**Config options:**

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `3001` | HTTP server port |
| `cors` | `true` | Enable CORS |

---

### module-auth

JWT-based authentication with bcrypt password hashing.

**Services registered:** `auth.verifyToken`, `auth.requireAuth`

**API endpoints:**

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/register` | Create account (`{ username, email, password }`) |
| `POST /api/auth/login` | Sign in (`{ username, password }`) → returns JWT |
| `GET /api/auth/me` | Get current user (requires Bearer token) |

**Events emitted:** `user.created`

**Config options:**

| Option | Default | Description |
|--------|---------|-------------|
| `jwtSecret` | `'change-me'` | JWT signing secret |
| `tokenExpiry` | `'24h'` | Token expiration |

---

### module-rbac

Role-based access control with automatic role assignment.

**Services registered:** `rbac.requireRole`

```js
// Usage in another module:
const requireRole = context.services.get('rbac.requireRole');
router.delete('/users/:id', requireAuth, requireRole('admin'), handler);
```

**API endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/rbac/roles` | List all roles |
| `POST /api/rbac/roles` | Create role (`{ name, description }`) |
| `POST /api/rbac/assign` | Assign role (`{ userId, roleName }`) |
| `GET /api/rbac/user/:userId` | Get roles for a user |
| `GET /api/rbac/roles/:roleName/permissions` | Get permissions for a role |

**Config options:**

| Option | Default | Description |
|--------|---------|-------------|
| `defaultRole` | `'user'` | Auto-assigned role on registration |

---

### module-dashboard

Sample dashboard page with system stats.

**API endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/dashboard/stats` | Returns user count, role count, uptime |

---

### module-firebase

Full Firebase suite — Firestore, Authentication, and Cloud Storage. Designed to **coexist** with SQLite/JWT modules or **replace** them.

**Services always registered:**

| Service | Description |
|---------|-------------|
| `firebase.admin` | Firebase Admin app instance |
| `firebase.firestore` | Firestore database instance |
| `firebase.auth` | Firebase Admin Auth instance |
| `firebase.storage` | Cloud Storage service (if bucket configured) |

**Automatic fallback services** (registered only when original modules are disabled):

| Service | Condition | Description |
|---------|-----------|-------------|
| `db` | `module-db-sqlite` disabled | Firestore adapter with SQL-compatible interface |
| `auth.verifyToken` | `module-auth` disabled | Firebase ID token verification |
| `auth.requireAuth` | `module-auth` disabled | Firebase auth middleware |

**API endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/firebase/health` | Firebase connectivity check |
| `GET /api/firebase/files?prefix=` | List files in Cloud Storage |
| `DELETE /api/firebase/files/:path` | Delete a file |

**Config options:**

| Option | Description |
|--------|-------------|
| `credential` | Path to service account JSON or inline credentials object |
| `databaseURL` | Firebase Realtime Database URL |
| `storageBucket` | Cloud Storage bucket name |

---

### ui-shell

React + Vite frontend with dynamic plugin discovery.

- Fetches `/api/__plugins` on boot to discover module routes and nav items
- Dynamic routing — modules declare routes and the shell renders them
- Dark theme with sidebar navigation
- Auth flow with protected routes
- Lazy-loaded page components

---

## Creating a New Module

1. Create a folder in `packages/`:

```
packages/module-my-feature/
├── package.json
└── index.js
```

2. Define the module contract in `index.js`:

```js
module.exports = {
  name: 'module-my-feature',
  version: '1.0.0',
  dependencies: ['module-api', 'module-auth'],

  // Optional: declare UI routes/nav
  ui: {
    routes: [{ path: '/my-feature', component: 'MyFeaturePage' }],
    nav: [{ label: 'My Feature', path: '/my-feature', icon: 'Star' }],
  },

  async register(context) {
    // Register services other modules can use
    context.services.register('my-feature.doSomething', () => { /* ... */ });
  },

  async init(context) {
    // Set up resources (create tables, connect to APIs, etc.)
    const db = context.services.get('db');
    db.exec('CREATE TABLE IF NOT EXISTS my_table (id INTEGER PRIMARY KEY, name TEXT)');
  },

  async start(context) {
    // Mount routes
    const { Router } = require('express');
    const router = Router();
    const registerRouter = context.services.get('api.registerRouter');
    const requireAuth = context.services.get('auth.requireAuth');

    router.get('/', requireAuth, (req, res) => {
      res.json({ message: 'Hello from my-feature!' });
    });

    registerRouter('/api/my-feature', router);
  },

  async stop() {},
  async destroy() {},
};
```

3. Create `package.json`:

```json
{
  "name": "@stratum/module-my-feature",
  "version": "1.0.0",
  "main": "index.js"
}
```

4. Add to `stratum.config.js`:

```js
'@stratum/module-my-feature': {
  enabled: true,
  options: { /* your config */ },
},
```

5. If the module has UI, add the component to `packages/ui-shell/src/components.js`:

```js
MyFeaturePage: lazy(() => import('./pages/MyFeaturePage')),
```

6. Run `npm install` and restart.

---

## API Reference

### Service Registry

```js
context.services.register(name, implementation)  // Register a named service
context.services.get(name)                       // Get a service (throws if missing)
context.services.has(name)                       // Check if a service exists
```

### Event Bus

```js
context.events.on(event, handler)    // Subscribe (returns unsubscribe function)
context.events.emit(event, data)     // Publish (async, runs handlers in order)
context.events.off(event, handler)   // Unsubscribe
```

### Logger

```js
context.logger.info('message')    // [module-name] message
context.logger.warn('message')
context.logger.error('message')
context.logger.debug('message')
```

---

## License

Stratum Community License v1.0 — free to use, create and sell your own modules, but the core cannot be modified or resold. See [LICENSE](LICENSE) for details.

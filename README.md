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
    │   └── ui/              #   └── RolesPage.jsx
    ├── module-dashboard/    # Sample dashboard with stats
    │   └── ui/              #   └── DashboardPage.jsx
    ├── module-firebase/     # Full Firebase suite (Firestore, Auth, Storage)
    └── ui-shell/            # React + Vite frontend shell (auto-discovers module UIs)
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
      options: {
        apiKey: 'your-api-key',
        authDomain: 'your-project.firebaseapp.com',
        projectId: 'your-project-id',
        storageBucket: 'your-project.firebasestorage.app',
        messagingSenderId: '123456789',
        appId: '1:123456789:web:abcdef',
      },
    },
  },
};
```

Set `enabled: false` to disable any module without removing code.

---

## Built-in Modules

### module-db-sqlite

SQLite database adapter using `better-sqlite3`. Implements the **Standard Database Interface**.

**Services registered:** `db`

| Method | Description |
|--------|-------------|
| **Schema** | |
| `db.createTable(table, columns)` | Create table with structured schema |
| `db.alterTable(table, changes)` | Add columns to existing table |
| `db.dropTable(table)` | Drop table / delete collection |
| `db.tableExists(table)` | Check if table exists, returns boolean |
| `db.listTables()` | List all table names, returns `string[]` |
| `db.exec(sql)` | Execute raw DDL (escape hatch) |
| **CRUD** | |
| `db.insert(table, data)` | Insert a row, returns `{ id }` |
| `db.insertMany(table, rows)` | Bulk insert, returns `{ count }` |
| `db.select(table, where, columns?)` | Fetch single row, returns object or `undefined` |
| `db.selectAll(table, where?, options?)` | Fetch multiple rows, returns array |
| `db.update(table, where, data)` | Update matching rows, returns `{ changes }` |
| `db.delete(table, where)` | Delete matching rows, returns `{ changes }` |
| `db.deleteAll(table)` | Delete all rows (truncate), returns `{ changes }` |
| `db.upsert(table, data, conflictKeys)` | Insert or ignore if conflict, returns `{ id, changes }` |
| **Aggregation** | |
| `db.count(table, where?)` | Count rows, returns number |
| `db.exists(table, where)` | Check existence, returns boolean |
| **Escape Hatch** | |
| `db.query(sql, params?)` | Raw SQL for complex queries (JOINs, OR, etc.), returns array |

**`where` parameter:** `{ column: value, ... }` — all conditions use AND equality.

**`options` parameter:** `{ columns, orderBy, order, limit, offset }`

**Column schema** (for `createTable`/`alterTable`): `{ type, primaryKey, autoIncrement, unique, required, default, references }`

Supported types: `integer`, `text`, `real`, `boolean`, `datetime`, `blob`

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

Full Firebase suite using the official Firebase JS SDK — Firestore, Authentication, and Cloud Storage. Designed to **coexist** with SQLite/JWT modules or **replace** them.

**Services always registered:**

| Service | Description |
|---------|-------------|
| `firebase.app` | Firebase app instance |
| `firebase.firestore` | Firestore database instance |
| `firebase.auth` | Firebase Auth instance |
| `firebase.storage` | Cloud Storage service |

**Automatic fallback services** (registered only when original modules are disabled):

| Service | Condition | Description |
|---------|-----------|-------------|
| `db` | `module-db-sqlite` disabled | Firestore adapter implementing the Standard Database Interface |
| `auth.verifyToken` | `module-auth` disabled | Firebase ID token verification |
| `auth.requireAuth` | `module-auth` disabled | Firebase auth middleware |

**API endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/firebase/health` | Firebase connectivity check |
| `GET /api/firebase/files?prefix=` | List files in Cloud Storage |
| `DELETE /api/firebase/files/:path` | Delete a file |

**Config options** (standard Firebase web config):

| Option | Description |
|--------|-------------|
| `apiKey` | Firebase API key |
| `authDomain` | Firebase Auth domain |
| `projectId` | Firebase project ID |
| `storageBucket` | Cloud Storage bucket |
| `messagingSenderId` | Messaging sender ID |
| `appId` | Firebase app ID |

---

### ui-shell

React + Vite frontend with **fully modular UI**. No manual registration needed.

- Fetches `/api/__plugins` on boot to discover module routes and nav items
- **Auto-discovers** page components from each module's `ui/` folder via Vite's `import.meta.glob`
- **Auto-imports** module CSS from each module's `ui/` folder (`.css` files)
- Dynamic routing — modules declare routes and the shell renders them
- Dark theme with sidebar navigation
- Auth flow with protected routes
- Lazy-loaded page components with automatic code-splitting

Each module ships its own UI components. The filename becomes the component name (e.g., `DashboardPage.jsx` → `DashboardPage`).

**Hybrid CSS:** The shell provides a design system with CSS variables and common component styles (`.page`, `.data-table`, `.stat-card`, `.inline-form`, etc.). Modules can add their own CSS files in `ui/` for module-specific styles — they are auto-imported at build time.

---

## Creating a New Module

1. Create a folder in `packages/`:

```
packages/module-my-feature/
├── package.json
├── index.js
└── ui/                      # Optional: React pages + CSS (auto-discovered)
    ├── MyFeaturePage.jsx
    └── styles.css           # Optional: module-specific styles
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
    await db.createTable('my_table', {
      id: { type: 'integer', primaryKey: true, autoIncrement: true },
      name: { type: 'text', required: true },
    });
  },

  async start(context) {
    // Mount routes
    const { Router } = require('express');
    const router = Router();
    const registerRouter = context.services.get('api.registerRouter');
    const requireAuth = context.services.get('auth.requireAuth');
    const db = context.services.get('db');

    router.get('/', requireAuth, async (req, res) => {
      const items = await db.selectAll('my_table');
      res.json(items);
    });

    router.post('/', requireAuth, async (req, res) => {
      const { id } = await db.insert('my_table', { name: req.body.name });
      res.status(201).json({ id, name: req.body.name });
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

4. If the module has UI, create page components in `ui/`:

```jsx
// packages/module-my-feature/ui/MyFeaturePage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '@stratum/ui-shell/src/AuthContext';

export default function MyFeaturePage() {
  const { authFetch } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    authFetch('/api/my-feature').then(r => r.json()).then(setItems);
  }, [authFetch]);

  return (
    <div className="page">
      <h2>My Feature</h2>
      {items.map(item => <p key={item.id}>{item.name}</p>)}
    </div>
  );
}
```

The filename must match the `component` name in `ui.routes` (e.g., `MyFeaturePage.jsx` → `'MyFeaturePage'`). No manual registration needed — the shell auto-discovers it.

5. Optionally, add module-specific CSS in `ui/`:

```css
/* packages/module-my-feature/ui/styles.css */

/* Use the shell's CSS variables for consistency */
.my-feature-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}

.my-feature-highlight {
  color: var(--primary);
  font-weight: 600;
}
```

Any `.css` files in `ui/` are auto-imported — no manual imports needed. Use the shell's CSS variables (`--bg`, `--surface`, `--border`, `--text`, `--primary`, `--radius`, etc.) to stay consistent with the design system.

6. Add to `stratum.config.js`:

```js
'@stratum/module-my-feature': {
  enabled: true,
  options: { /* your config */ },
},
```

7. Run `npm install` and restart.

---

## CSS Design System

The `ui-shell` provides a design system that all modules should use for visual consistency. Modules **can** add their own CSS for custom components — just drop `.css` files in the module's `ui/` folder.

### Available CSS Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--bg` | `#0f1117` | Page background |
| `--surface` | `#1a1d27` | Card/panel background |
| `--border` | `#2a2d3a` | Border color |
| `--text` | `#e1e4ed` | Primary text |
| `--text-muted` | `#8b8fa3` | Secondary text |
| `--primary` | `#6366f1` | Accent color (indigo) |
| `--primary-hover` | `#5558e6` | Accent hover |
| `--danger` | `#ef4444` | Error/destructive |
| `--success` | `#22c55e` | Success/positive |
| `--radius` | `8px` | Border radius |

### Reusable CSS Classes

| Class | Description |
|-------|-------------|
| `.page` | Page container with heading spacing |
| `.stats-grid` | Responsive grid for stat cards |
| `.stat-card` | Individual stat display |
| `.data-table` | Styled table with hover rows |
| `.inline-form` | Horizontal form layout |
| `.error-msg` | Error message banner |

---

## API Reference

### Standard Database Interface

All database adapters implement this interface. Always `await` every call.

```js
const db = context.services.get('db');

// Schema management
await db.createTable('products', {
  id: { type: 'integer', primaryKey: true, autoIncrement: true },
  name: { type: 'text', required: true },
  price: { type: 'real', default: 0 },
})
await db.alterTable('products', { add: { sku: { type: 'text', unique: true } } })
await db.dropTable('old_table')
await db.tableExists('products')              // → true
await db.listTables()                         // → ['products', 'users', ...]

// CRUD
await db.insert('users', { name: 'Alice' })   // → { id: 1 }
await db.insertMany('users', [                // → { count: 2 }
  { name: 'Bob' }, { name: 'Carol' },
])
await db.select('users', { id: 1 })           // → { id: 1, name: 'Alice' } or undefined
await db.select('users', { id: 1 }, ['name']) // → { name: 'Alice' } (specific columns)
await db.selectAll('roles')                   // → [{ id: 1, name: 'admin' }, ...]
await db.selectAll('users', {}, {             // With options:
  orderBy: 'created_at', order: 'desc',       //   sorting
  limit: 10, offset: 0,                       //   pagination
  columns: ['id', 'name'],                    //   column selection
})
await db.update('users', { id: 1 }, { name: 'Bob' })  // → { changes: 1 }
await db.delete('users', { id: 1 })                    // → { changes: 1 }
await db.deleteAll('temp_data')                         // → { changes: N }
await db.upsert('roles', { name: 'admin' }, ['name'])  // → { id, changes } (0 if existed)

// Aggregation
await db.count('users')                       // → 42
await db.count('users', { role: 'admin' })    // → 3
await db.exists('users', { username: 'alice'})// → true

// Escape hatch (raw SQL — not portable to non-SQL adapters)
await db.query('SELECT ... JOIN ...', [params])  // → [rows]
```

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

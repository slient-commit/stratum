const path = require('path');
const fs = require('fs');

let Database;

module.exports = {
  name: 'module-db-sqlite',
  version: '1.0.0',
  dependencies: [],

  async register(context) {
    context.logger.info('Registered');
  },

  async init(context) {
    Database = require('better-sqlite3');

    const dbPath = path.resolve(context.config.filename || './data/stratum.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Register a db service with a clean API
    context.services.register('db', {
      run: (sql, params) => db.prepare(sql).run(...(params || [])),
      get: (sql, params) => db.prepare(sql).get(...(params || [])),
      all: (sql, params) => db.prepare(sql).all(...(params || [])),
      exec: (sql) => db.exec(sql),
      raw: db,
    });

    this._db = db;
    context.logger.info(`Connected to ${dbPath}`);
  },

  async start() {},

  async stop() {},

  async destroy(context) {
    if (this._db) {
      this._db.close();
      context.logger.info('Connection closed');
    }
  },
};

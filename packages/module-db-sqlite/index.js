const path = require('path');
const fs = require('fs');
const { DatabaseInterface } = require('@stratum/core');

let Database;

module.exports = {
  name: 'module-db-sqlite',
  version: '2.0.0',
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

    // ─── Helpers ──────────────────────────────────────────

    function buildWhere(where) {
      const keys = Object.keys(where || {});
      if (keys.length === 0) return { clause: '', params: [] };
      const clause = ' WHERE ' + keys.map((k) => `${k} = ?`).join(' AND ');
      const params = keys.map((k) => where[k]);
      return { clause, params };
    }

    function buildColumns(columns) {
      if (!columns || columns.length === 0) return '*';
      return columns.join(', ');
    }

    const TYPE_MAP = {
      integer: 'INTEGER',
      text: 'TEXT',
      real: 'REAL',
      boolean: 'INTEGER',
      datetime: 'DATETIME',
      blob: 'BLOB',
    };

    function buildColumnDef(name, def) {
      const parts = [name, TYPE_MAP[def.type] || 'TEXT'];
      if (def.primaryKey) parts.push('PRIMARY KEY');
      if (def.autoIncrement) parts.push('AUTOINCREMENT');
      if (def.unique) parts.push('UNIQUE');
      if (def.required) parts.push('NOT NULL');
      if (def.default !== undefined) {
        const val =
          typeof def.default === 'string' && def.default !== 'CURRENT_TIMESTAMP'
            ? `'${def.default}'`
            : def.default;
        parts.push(`DEFAULT ${val}`);
      }
      return parts.join(' ');
    }

    // ─── Standard Database Interface ─────────────────────

    const adapter = {
      // Raw DDL
      exec: (sql) => db.exec(sql),

      // Create table from structured schema
      createTable: (table, columns) => {
        const colDefs = Object.entries(columns).map(([name, def]) =>
          buildColumnDef(name, def)
        );
        // Collect foreign keys
        const fks = Object.entries(columns)
          .filter(([, def]) => def.references)
          .map(
            ([name, def]) =>
              `FOREIGN KEY (${name}) REFERENCES ${def.references.table}(${def.references.column})`
          );
        const allDefs = [...colDefs, ...fks].join(',\n    ');
        db.exec(`CREATE TABLE IF NOT EXISTS ${table} (\n    ${allDefs}\n  )`);
      },

      // Add columns to existing table
      alterTable: (table, changes) => {
        if (changes.add) {
          for (const [name, def] of Object.entries(changes.add)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${buildColumnDef(name, def)}`);
          }
        }
      },

      // Drop table
      dropTable: (table) => {
        db.exec(`DROP TABLE IF EXISTS ${table}`);
      },

      // Check if table exists
      tableExists: (table) => {
        const row = db
          .prepare(
            `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`
          )
          .get(table);
        return row !== undefined;
      },

      // List all tables
      listTables: () => {
        const rows = db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
          )
          .all();
        return rows.map((r) => r.name);
      },

      // Single row
      select: (table, where, columns) => {
        const cols = buildColumns(columns);
        const { clause, params } = buildWhere(where);
        return db.prepare(`SELECT ${cols} FROM ${table}${clause} LIMIT 1`).get(...params);
      },

      // Multiple rows
      selectAll: (table, where, options = {}) => {
        const cols = buildColumns(options.columns);
        const { clause, params } = buildWhere(where);

        let sql = `SELECT ${cols} FROM ${table}${clause}`;

        if (options.orderBy) {
          const dir = (options.order || 'asc').toUpperCase();
          sql += ` ORDER BY ${options.orderBy} ${dir}`;
        }
        if (options.limit != null) {
          sql += ` LIMIT ${Number(options.limit)}`;
        }
        if (options.offset != null) {
          sql += ` OFFSET ${Number(options.offset)}`;
        }

        return db.prepare(sql).all(...params);
      },

      // Insert
      insert: (table, data) => {
        const keys = Object.keys(data);
        const placeholders = keys.map(() => '?').join(', ');
        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        const result = db.prepare(sql).run(...keys.map((k) => data[k]));
        return { id: Number(result.lastInsertRowid) };
      },

      // Bulk insert
      insertMany: (table, rows) => {
        if (!rows || rows.length === 0) return { count: 0 };
        const keys = Object.keys(rows[0]);
        const placeholders = keys.map(() => '?').join(', ');
        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        const stmt = db.prepare(sql);
        const insertAll = db.transaction((items) => {
          for (const row of items) {
            stmt.run(...keys.map((k) => row[k]));
          }
        });
        insertAll(rows);
        return { count: rows.length };
      },

      // Update
      update: (table, where, data) => {
        const setCols = Object.keys(data);
        const setClause = setCols.map((k) => `${k} = ?`).join(', ');
        const { clause, params: whereParams } = buildWhere(where);
        const sql = `UPDATE ${table} SET ${setClause}${clause}`;
        const allParams = [...setCols.map((k) => data[k]), ...whereParams];
        const result = db.prepare(sql).run(...allParams);
        return { changes: result.changes };
      },

      // Delete
      delete: (table, where) => {
        const { clause, params } = buildWhere(where);
        const sql = `DELETE FROM ${table}${clause}`;
        const result = db.prepare(sql).run(...params);
        return { changes: result.changes };
      },

      // Delete all rows (truncate)
      deleteAll: (table) => {
        const result = db.prepare(`DELETE FROM ${table}`).run();
        return { changes: result.changes };
      },

      // Upsert (INSERT OR IGNORE)
      upsert: (table, data, conflictKeys) => {
        const keys = Object.keys(data);
        const placeholders = keys.map(() => '?').join(', ');
        const sql = `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        const result = db.prepare(sql).run(...keys.map((k) => data[k]));
        return {
          id: Number(result.lastInsertRowid),
          changes: result.changes,
        };
      },

      // Count
      count: (table, where) => {
        const { clause, params } = buildWhere(where);
        const row = db
          .prepare(`SELECT COUNT(*) as count FROM ${table}${clause}`)
          .get(...params);
        return row.count;
      },

      // Exists
      exists: (table, where) => {
        const { clause, params } = buildWhere(where);
        const row = db
          .prepare(`SELECT 1 FROM ${table}${clause} LIMIT 1`)
          .get(...params);
        return row !== undefined;
      },

      // Escape hatch: raw query
      query: (sql, params) => {
        return db.prepare(sql).all(...(params || []));
      },

      // Underlying instance
      raw: db,
    };

    DatabaseInterface.validateAdapter(adapter, 'module-db-sqlite');
    context.services.register('db', adapter);

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

/**
 * Stratum Standard Database Interface
 *
 * All database adapter modules (module-db-sqlite, module-firebase, etc.)
 * MUST register a 'db' service implementing every method below.
 *
 * Consumers MUST always `await` every method call — even if the underlying
 * implementation is synchronous (e.g. better-sqlite3), the return value is
 * treated as potentially async so that adapters are interchangeable.
 *
 * ─── Terminology ───
 *   table    - string: collection/table name
 *   where    - object: { column: value, ... } — all conditions are AND equality
 *   data     - object: { column: value, ... } — the row/document to write
 *   columns  - string[]: optional list of columns to return (default: all)
 *   options  - object: { columns, orderBy, order, limit, offset } for selectAll
 *
 * ─── Column Schema ───
 *   Used by createTable() and alterTable(). Each column is defined as:
 *   {
 *     type: 'integer' | 'text' | 'real' | 'boolean' | 'datetime' | 'blob',
 *     primaryKey: boolean,    // PRIMARY KEY
 *     autoIncrement: boolean, // AUTOINCREMENT (requires primaryKey + integer)
 *     unique: boolean,        // UNIQUE constraint
 *     required: boolean,      // NOT NULL constraint
 *     default: any,           // DEFAULT value
 *     references: { table: string, column: string },  // FOREIGN KEY
 *   }
 */

const REQUIRED_METHODS = [
  // Schema management
  'exec',
  'createTable',
  'alterTable',
  'dropTable',
  'tableExists',
  'listTables',
  // CRUD
  'select',
  'selectAll',
  'insert',
  'insertMany',
  'update',
  'delete',
  'deleteAll',
  'upsert',
  // Aggregation
  'count',
  'exists',
  // Escape hatch
  'query',
];

// ─── Schema Management ───────────────────────────────────

/**
 * @param {string} sql - Raw DDL statement(s)
 * @returns {void}
 * @description Execute raw DDL (CREATE TABLE, etc.). No-op for schemaless stores.
 * @name exec
 */

/**
 * @param {string} table - Table/collection name
 * @param {object} columns - Column definitions { name: { type, primaryKey, autoIncrement, unique, required, default, references } }
 * @returns {void}
 * @description Create a table or collection with the given schema.
 *   For schemaless stores (Firestore), this may store schema metadata
 *   but does not enforce structure.
 * @example
 *   db.createTable('users', {
 *     id: { type: 'integer', primaryKey: true, autoIncrement: true },
 *     username: { type: 'text', unique: true, required: true },
 *     email: { type: 'text', unique: true, required: true },
 *     password_hash: { type: 'text', required: true },
 *     created_at: { type: 'datetime', default: 'CURRENT_TIMESTAMP' },
 *   })
 * @name createTable
 */

/**
 * @param {string} table - Table/collection name
 * @param {object} changes - { add: { colName: columnDef, ... } }
 * @returns {void}
 * @description Add columns to an existing table. No-op for schemaless stores.
 * @example
 *   db.alterTable('users', {
 *     add: {
 *       avatar_url: { type: 'text' },
 *       bio: { type: 'text', default: '' },
 *     }
 *   })
 * @name alterTable
 */

/**
 * @param {string} table - Table/collection name
 * @returns {void}
 * @description Drop a table or delete all documents in a collection.
 * @name dropTable
 */

/**
 * @param {string} table - Table/collection name
 * @returns {boolean}
 * @description Check if a table or collection exists.
 * @name tableExists
 */

/**
 * @returns {string[]}
 * @description List all table or collection names.
 * @name listTables
 */

// ─── Read ────────────────────────────────────────────────

/**
 * @param {string}   table   - Table/collection name
 * @param {object}   where   - { column: value } pairs (AND equality)
 * @param {string[]} [columns] - Columns to return (omit for all)
 * @returns {object|undefined} - Single row or undefined
 * @name select
 */

/**
 * @param {string}  table      - Table/collection name
 * @param {object}  [where={}] - { column: value } pairs (AND equality)
 * @param {object}  [options={}]
 * @param {string[]} [options.columns] - Columns to return
 * @param {string}  [options.orderBy]  - Column to sort by
 * @param {'asc'|'desc'} [options.order='asc'] - Sort direction
 * @param {number}  [options.limit]    - Max rows
 * @param {number}  [options.offset]   - Rows to skip
 * @returns {object[]} - Array of rows
 * @name selectAll
 */

// ─── Write ───────────────────────────────────────────────

/**
 * @param {string} table - Table/collection name
 * @param {object} data  - { column: value } pairs for the new row
 * @returns {{ id: number|string }} - Generated primary key
 * @name insert
 */

/**
 * @param {string}   table - Table/collection name
 * @param {object[]} rows  - Array of { column: value } objects
 * @returns {{ count: number }} - Number of rows inserted
 * @description Bulk insert multiple rows in a single operation.
 * @name insertMany
 */

/**
 * @param {string} table - Table/collection name
 * @param {object} where - { column: value } pairs (AND equality)
 * @param {object} data  - { column: value } pairs to update
 * @returns {{ changes: number }} - Rows affected
 * @name update
 */

/**
 * @param {string} table - Table/collection name
 * @param {object} where - { column: value } pairs (AND equality)
 * @returns {{ changes: number }} - Rows deleted
 * @name delete
 */

/**
 * @param {string} table - Table/collection name
 * @returns {{ changes: number }} - Total rows deleted
 * @description Delete all rows from a table (truncate). Table structure is preserved.
 * @name deleteAll
 */

/**
 * @param {string}   table        - Table/collection name
 * @param {object}   data         - { column: value } pairs for the row
 * @param {string[]} conflictKeys - Columns that define uniqueness
 * @returns {{ id: number|string, changes: number }} - changes=0 if already existed
 * @name upsert
 */

// ─── Aggregation ─────────────────────────────────────────

/**
 * @param {string} table   - Table/collection name
 * @param {object} [where] - { column: value } pairs (AND equality)
 * @returns {number} - Row count
 * @name count
 */

/**
 * @param {string} table - Table/collection name
 * @param {object} where - { column: value } pairs (AND equality)
 * @returns {boolean}
 * @name exists
 */

// ─── Escape Hatch ────────────────────────────────────────

/**
 * @param {string} sql      - Raw query (SQL for relational DBs)
 * @param {any[]}  [params] - Parameterized values
 * @returns {object[]} - Array of result rows
 * @description Escape hatch for complex queries (JOINs, OR, subqueries).
 * @name query
 */

/**
 * Validate that a database adapter implements all required methods.
 * Call this before registering the 'db' service to fail fast.
 *
 * @param {object} implementation - The db service object
 * @param {string} name - Adapter name (for error messages)
 * @throws {Error} If any required method is missing
 */
function validateAdapter(implementation, name) {
  const missing = REQUIRED_METHODS.filter(
    (m) => typeof implementation[m] !== 'function'
  );
  if (missing.length > 0) {
    throw new Error(
      `Database adapter "${name}" is missing required methods: ${missing.join(', ')}`
    );
  }
}

module.exports = { REQUIRED_METHODS, validateAdapter };

/**
 * Firestore adapter that implements the same db service interface as module-db-sqlite.
 *
 * Maps SQL-like calls to Firestore operations using a collection-per-table convention.
 * Handles the specific SQL patterns used by Stratum modules (auth, rbac, dashboard).
 *
 * Interface: { run(sql, params), get(sql, params), all(sql, params), exec(sql), raw }
 */

class FirestoreDB {
  constructor(firestore) {
    this._db = firestore;
    this._counters = {};
  }

  /**
   * exec(sql) — DDL statements. No-op for Firestore (schemaless).
   */
  exec() {
    // CREATE TABLE, etc. are no-ops in Firestore
  }

  /**
   * run(sql, params) — INSERT/UPDATE/DELETE operations.
   * Returns { lastInsertRowid, changes }.
   */
  async run(sql, params) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    // INSERT OR IGNORE INTO table (cols) VALUES (?, ...)
    const insertIgnore = normalized.match(
      /^INSERT OR IGNORE INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i
    );
    if (insertIgnore) {
      return this._insertOrIgnore(insertIgnore[1], insertIgnore[2], params);
    }

    // INSERT INTO table (cols) VALUES (?, ...)
    const insert = normalized.match(
      /^INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i
    );
    if (insert) {
      return this._insert(insert[1], insert[2], params);
    }

    // UPDATE table SET col=? WHERE col=?
    const update = normalized.match(
      /^UPDATE (\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i
    );
    if (update) {
      return this._update(update[1], update[2], update[3], params);
    }

    // DELETE FROM table WHERE col=?
    const del = normalized.match(/^DELETE FROM (\w+)\s+WHERE\s+(.+)/i);
    if (del) {
      return this._delete(del[1], del[2], params);
    }

    return { lastInsertRowid: 0, changes: 0 };
  }

  /**
   * get(sql, params) — SELECT single row. Returns object or undefined.
   */
  async get(sql, params) {
    const rows = await this._select(sql, params, 1);
    return rows[0] || undefined;
  }

  /**
   * all(sql, params) — SELECT multiple rows. Returns array.
   */
  async all(sql, params) {
    return this._select(sql, params);
  }

  // ─── Private: INSERT ────────────────────────────────────────

  async _insert(table, colsStr, params) {
    const cols = colsStr.split(',').map((c) => c.trim());
    const doc = {};
    cols.forEach((col, i) => {
      doc[col] = params[i];
    });

    const id = await this._nextId(table);
    doc.id = id;

    if (table === 'users') {
      doc.created_at = new Date().toISOString();
    }

    await this._db.collection(table).doc(String(id)).set(doc);
    return { lastInsertRowid: id, changes: 1 };
  }

  async _insertOrIgnore(table, colsStr, params) {
    const cols = colsStr.split(',').map((c) => c.trim());
    const doc = {};
    cols.forEach((col, i) => {
      doc[col] = params[i];
    });

    // Check for duplicates using the first column as unique key
    const uniqueCol = cols[0];
    const existing = await this._db
      .collection(table)
      .where(uniqueCol, '==', doc[uniqueCol])
      .limit(1)
      .get();

    if (!existing.empty) {
      return { lastInsertRowid: 0, changes: 0 };
    }

    // For composite key tables (user_roles, role_permissions), check both keys
    if (cols.length === 2 && (table === 'user_roles' || table === 'role_permissions')) {
      const compositeId = `${doc[cols[0]]}_${doc[cols[1]]}`;
      const docRef = this._db.collection(table).doc(compositeId);
      const snap = await docRef.get();
      if (snap.exists) {
        return { lastInsertRowid: 0, changes: 0 };
      }
      doc.id = compositeId;
      await docRef.set(doc);
      return { lastInsertRowid: 0, changes: 1 };
    }

    const id = await this._nextId(table);
    doc.id = id;
    await this._db.collection(table).doc(String(id)).set(doc);
    return { lastInsertRowid: id, changes: 1 };
  }

  // ─── Private: UPDATE ────────────────────────────────────────

  async _update(table, setClause, whereClause, params) {
    const setCols = setClause.split(',').map((s) => s.trim().split(/\s*=\s*/)[0]);
    const whereCols = this._parseWhereColumns(whereClause);
    const setCount = setCols.length;

    const updateData = {};
    setCols.forEach((col, i) => {
      updateData[col] = params[i];
    });

    const snapshot = await this._whereQuery(
      table,
      whereClause,
      params.slice(setCount)
    );

    let changes = 0;
    for (const doc of snapshot.docs) {
      await doc.ref.update(updateData);
      changes++;
    }

    return { lastInsertRowid: 0, changes };
  }

  // ─── Private: DELETE ────────────────────────────────────────

  async _delete(table, whereClause, params) {
    const snapshot = await this._whereQuery(table, whereClause, params);
    let changes = 0;
    for (const doc of snapshot.docs) {
      await doc.ref.delete();
      changes++;
    }
    return { lastInsertRowid: 0, changes };
  }

  // ─── Private: SELECT ───────────────────────────────────────

  async _select(sql, params, limit) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    // SELECT COUNT(*) as alias FROM table
    const countMatch = normalized.match(
      /^SELECT COUNT\(\*\)\s+as\s+(\w+)\s+FROM\s+(\w+)/i
    );
    if (countMatch) {
      const alias = countMatch[1];
      const table = countMatch[2];
      const snapshot = await this._db.collection(table).get();
      return [{ [alias]: snapshot.size }];
    }

    // Detect JOINs
    if (/\bJOIN\b/i.test(normalized)) {
      return this._selectWithJoin(normalized, params, limit);
    }

    // Simple SELECT: extract table, columns, WHERE
    const selectMatch = normalized.match(
      /^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i
    );
    if (!selectMatch) return [];

    const colsStr = selectMatch[1].trim();
    const table = selectMatch[2];
    const whereClause = selectMatch[3];

    let snapshot;
    if (whereClause) {
      snapshot = await this._whereQuery(table, whereClause, params || [], limit);
    } else {
      let query = this._db.collection(table);
      if (limit) query = query.limit(limit);
      snapshot = await query.get();
    }

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      if (colsStr === '*') return data;
      return this._pickColumns(data, colsStr);
    });
  }

  // ─── Private: JOIN handler ──────────────────────────────────

  async _selectWithJoin(sql, params, limit) {
    // Handle: SELECT cols FROM t1 JOIN t2 ON t1.col=t2.col WHERE ...
    // Strategy: parse tables, execute as multi-step Firestore reads

    // Extract the primary table and all JOINs
    const fromMatch = sql.match(/FROM\s+(\w+)\s+(\w+)?/i);
    if (!fromMatch) return [];

    const joins = [];
    const joinRegex = /JOIN\s+(\w+)\s+(\w+)\s+ON\s+(\w+\.\w+)\s*=\s*(\w+\.\w+)/gi;
    let m;
    while ((m = joinRegex.exec(sql)) !== null) {
      joins.push({
        table: m[1],
        alias: m[2],
        leftKey: m[3],
        rightKey: m[4],
      });
    }

    const whereMatch = sql.match(/WHERE\s+(.+)$/i);
    const whereClause = whereMatch ? whereMatch[1].trim() : null;

    // Extract column selections
    const colsMatch = sql.match(/^SELECT\s+(.+?)\s+FROM/i);
    const colsStr = colsMatch ? colsMatch[1].trim() : '*';

    // For RBAC join queries, use a denormalized approach:
    // Query the WHERE table first, then follow references

    if (whereClause && params && params.length > 0) {
      // Parse WHERE: alias.col = ?
      const whereParts = whereClause.match(/(\w+)\.(\w+)\s*=\s*\?/g) || [];
      const conditions = whereParts.map((p) => {
        const [ref, col] = p.replace(/\s*=\s*\?/, '').split('.');
        return { alias: ref, col };
      });

      // Build an alias→table map
      const aliasMap = {};
      aliasMap[fromMatch[2] || fromMatch[1]] = fromMatch[1];
      for (const j of joins) {
        aliasMap[j.alias] = j.table;
      }

      // Start from the table referenced in WHERE
      const startAlias = conditions[0]?.alias;
      const startTable = aliasMap[startAlias] || startAlias;

      // Query the start table
      let query = this._db.collection(startTable);
      conditions.forEach((cond, i) => {
        if (aliasMap[cond.alias] === startTable) {
          query = query.where(cond.col, '==', params[i]);
        }
      });
      if (limit) query = query.limit(limit);

      const startSnap = await query.get();
      if (startSnap.empty) return [];

      // Follow joins to collect data
      const results = [];
      for (const startDoc of startSnap.docs) {
        const startData = startDoc.data();
        let merged = { ...startData };

        // For each join, look up the referenced docs
        for (const join of joins) {
          const leftParts = join.leftKey.split('.');
          const rightParts = join.rightKey.split('.');

          // Determine which side references which
          const leftAlias = leftParts[0];
          const leftCol = leftParts[1];
          const rightAlias = rightParts[0];
          const rightCol = rightParts[1];

          let lookupTable, lookupCol, lookupValue;

          if (aliasMap[leftAlias] === join.table) {
            lookupTable = join.table;
            lookupCol = leftCol;
            lookupValue = merged[rightCol];
          } else {
            lookupTable = aliasMap[rightAlias] === join.table ? join.table : aliasMap[leftAlias];
            lookupCol = rightCol;
            lookupValue = merged[leftCol] || startData[leftCol];
          }

          if (lookupValue !== undefined) {
            const joinSnap = await this._db
              .collection(lookupTable)
              .where(lookupCol, '==', lookupValue)
              .get();

            for (const jDoc of joinSnap.docs) {
              merged = { ...merged, ...jDoc.data() };
            }
          }
        }

        // Check additional WHERE conditions against merged data
        let matches = true;
        conditions.forEach((cond, i) => {
          if (aliasMap[cond.alias] !== startTable) {
            if (merged[cond.col] != params[i]) matches = false;
          }
        });

        if (matches) {
          if (colsStr === '*' || colsStr === '1') {
            results.push(colsStr === '1' ? { '1': 1 } : merged);
          } else {
            results.push(this._pickColumns(merged, colsStr));
          }
        }
      }

      return limit ? results.slice(0, limit) : results;
    }

    // No WHERE — full join (e.g., SELECT * FROM roles)
    const snapshot = await this._db.collection(fromMatch[1]).get();
    return snapshot.docs.map((doc) => doc.data());
  }

  // ─── Private: WHERE query builder ────────────────────────────

  async _whereQuery(table, whereClause, params, limit) {
    let query = this._db.collection(table);

    // Handle: col = ? AND col = ?
    // Handle: col = ? OR col = ?
    const isOr = /\bOR\b/i.test(whereClause);
    const parts = whereClause.split(/\s+(?:AND|OR)\s+/i);

    if (isOr) {
      // Firestore doesn't support OR across different fields easily,
      // so we run multiple queries and merge
      const allDocs = new Map();
      for (let i = 0; i < parts.length; i++) {
        const colMatch = parts[i].match(/(\w+)\s*=\s*\?/);
        if (colMatch) {
          let q = this._db.collection(table).where(colMatch[1], '==', params[i]);
          if (limit) q = q.limit(limit);
          const snap = await q.get();
          for (const doc of snap.docs) {
            allDocs.set(doc.id, doc);
          }
        }
      }
      return {
        empty: allDocs.size === 0,
        size: allDocs.size,
        docs: Array.from(allDocs.values()),
      };
    }

    // AND conditions
    parts.forEach((part, i) => {
      const colMatch = part.match(/(\w+)\s*=\s*\?/);
      if (colMatch) {
        query = query.where(colMatch[1], '==', params[i]);
      }
    });

    if (limit) query = query.limit(limit);
    return query.get();
  }

  // ─── Private: helpers ──────────────────────────────────────

  _parseWhereColumns(whereClause) {
    const matches = whereClause.match(/(\w+)\s*=\s*\?/g) || [];
    return matches.map((m) => m.replace(/\s*=\s*\?/, ''));
  }

  _pickColumns(data, colsStr) {
    // Handle aliased columns like "r.name, r.description"
    const cols = colsStr.split(',').map((c) => c.trim());
    const result = {};
    for (const col of cols) {
      // Strip table alias (e.g., "r.name" → "name")
      const name = col.includes('.') ? col.split('.').pop() : col;
      if (data[name] !== undefined) {
        result[name] = data[name];
      }
    }
    return result;
  }

  async _nextId(table) {
    const counterRef = this._db.collection('_counters').doc(table);
    const counterSnap = await counterRef.get();
    const current = counterSnap.exists ? counterSnap.data().value : 0;
    const next = current + 1;
    await counterRef.set({ value: next });
    return next;
  }
}

module.exports = FirestoreDB;

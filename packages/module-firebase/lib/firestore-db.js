/**
 * Firestore adapter that implements the same db service interface as module-db-sqlite.
 *
 * Uses the Firebase JS SDK (modular v9+) instead of firebase-admin.
 * Maps SQL-like calls to Firestore operations using a collection-per-table convention.
 *
 * Interface: { run(sql, params), get(sql, params), all(sql, params), exec(sql), raw }
 */

const {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit: firestoreLimit,
} = require('firebase/firestore');

class FirestoreDB {
  constructor(firestore) {
    this._db = firestore;
  }

  /**
   * exec(sql) — DDL statements. No-op for Firestore (schemaless).
   */
  exec() {}

  /**
   * run(sql, params) — INSERT/UPDATE/DELETE operations.
   * Returns { lastInsertRowid, changes }.
   */
  async run(sql, params) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    const insertIgnore = normalized.match(
      /^INSERT OR IGNORE INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i
    );
    if (insertIgnore) {
      return this._insertOrIgnore(insertIgnore[1], insertIgnore[2], params);
    }

    const insert = normalized.match(
      /^INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i
    );
    if (insert) {
      return this._insert(insert[1], insert[2], params);
    }

    const update = normalized.match(
      /^UPDATE (\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i
    );
    if (update) {
      return this._update(update[1], update[2], update[3], params);
    }

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
    const data = {};
    cols.forEach((col, i) => {
      data[col] = params[i];
    });

    const id = await this._nextId(table);
    data.id = id;

    if (table === 'users') {
      data.created_at = new Date().toISOString();
    }

    await setDoc(doc(this._db, table, String(id)), data);
    return { lastInsertRowid: id, changes: 1 };
  }

  async _insertOrIgnore(table, colsStr, params) {
    const cols = colsStr.split(',').map((c) => c.trim());
    const data = {};
    cols.forEach((col, i) => {
      data[col] = params[i];
    });

    // Composite key tables (user_roles, role_permissions)
    if (cols.length === 2 && (table === 'user_roles' || table === 'role_permissions')) {
      const compositeId = `${data[cols[0]]}_${data[cols[1]]}`;
      const docRef = doc(this._db, table, compositeId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { lastInsertRowid: 0, changes: 0 };
      }
      data.id = compositeId;
      await setDoc(docRef, data);
      return { lastInsertRowid: 0, changes: 1 };
    }

    // Check for duplicate on first column
    const uniqueCol = cols[0];
    const q = query(
      collection(this._db, table),
      where(uniqueCol, '==', data[uniqueCol]),
      firestoreLimit(1)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      return { lastInsertRowid: 0, changes: 0 };
    }

    const id = await this._nextId(table);
    data.id = id;
    await setDoc(doc(this._db, table, String(id)), data);
    return { lastInsertRowid: id, changes: 1 };
  }

  // ─── Private: UPDATE ────────────────────────────────────────

  async _update(table, setClause, whereClause, params) {
    const setCols = setClause.split(',').map((s) => s.trim().split(/\s*=\s*/)[0]);
    const setCount = setCols.length;

    const updateData = {};
    setCols.forEach((col, i) => {
      updateData[col] = params[i];
    });

    const snapshot = await this._whereQuery(table, whereClause, params.slice(setCount));

    let changes = 0;
    for (const d of snapshot.docs) {
      await updateDoc(d.ref, updateData);
      changes++;
    }

    return { lastInsertRowid: 0, changes };
  }

  // ─── Private: DELETE ────────────────────────────────────────

  async _delete(table, whereClause, params) {
    const snapshot = await this._whereQuery(table, whereClause, params);
    let changes = 0;
    for (const d of snapshot.docs) {
      await deleteDoc(d.ref);
      changes++;
    }
    return { lastInsertRowid: 0, changes };
  }

  // ─── Private: SELECT ───────────────────────────────────────

  async _select(sql, params, lim) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    // SELECT COUNT(*) as alias FROM table
    const countMatch = normalized.match(
      /^SELECT COUNT\(\*\)\s+as\s+(\w+)\s+FROM\s+(\w+)/i
    );
    if (countMatch) {
      const alias = countMatch[1];
      const table = countMatch[2];
      const snapshot = await getDocs(collection(this._db, table));
      return [{ [alias]: snapshot.size }];
    }

    // Detect JOINs
    if (/\bJOIN\b/i.test(normalized)) {
      return this._selectWithJoin(normalized, params, lim);
    }

    // Simple SELECT
    const selectMatch = normalized.match(
      /^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i
    );
    if (!selectMatch) return [];

    const colsStr = selectMatch[1].trim();
    const table = selectMatch[2];
    const whereClause = selectMatch[3];

    let snapshot;
    if (whereClause) {
      snapshot = await this._whereQuery(table, whereClause, params || [], lim);
    } else {
      const constraints = [];
      if (lim) constraints.push(firestoreLimit(lim));
      const q = constraints.length
        ? query(collection(this._db, table), ...constraints)
        : collection(this._db, table);
      snapshot = await getDocs(q);
    }

    return snapshot.docs.map((d) => {
      const data = d.data();
      if (colsStr === '*') return data;
      return this._pickColumns(data, colsStr);
    });
  }

  // ─── Private: JOIN handler ──────────────────────────────────

  async _selectWithJoin(sql, params, lim) {
    const fromMatch = sql.match(/FROM\s+(\w+)\s+(\w+)?/i);
    if (!fromMatch) return [];

    const joins = [];
    const joinRegex = /JOIN\s+(\w+)\s+(\w+)\s+ON\s+(\w+\.\w+)\s*=\s*(\w+\.\w+)/gi;
    let m;
    while ((m = joinRegex.exec(sql)) !== null) {
      joins.push({ table: m[1], alias: m[2], leftKey: m[3], rightKey: m[4] });
    }

    const whereMatch = sql.match(/WHERE\s+(.+)$/i);
    const whereClause = whereMatch ? whereMatch[1].trim() : null;
    const colsMatch = sql.match(/^SELECT\s+(.+?)\s+FROM/i);
    const colsStr = colsMatch ? colsMatch[1].trim() : '*';

    if (whereClause && params && params.length > 0) {
      const whereParts = whereClause.match(/(\w+)\.(\w+)\s*=\s*\?/g) || [];
      const conditions = whereParts.map((p) => {
        const [ref, col] = p.replace(/\s*=\s*\?/, '').split('.');
        return { alias: ref, col };
      });

      const aliasMap = {};
      aliasMap[fromMatch[2] || fromMatch[1]] = fromMatch[1];
      for (const j of joins) aliasMap[j.alias] = j.table;

      const startAlias = conditions[0]?.alias;
      const startTable = aliasMap[startAlias] || startAlias;

      // Build query constraints
      const constraints = [];
      conditions.forEach((cond, i) => {
        if (aliasMap[cond.alias] === startTable) {
          constraints.push(where(cond.col, '==', params[i]));
        }
      });
      if (lim) constraints.push(firestoreLimit(lim));

      const q = query(collection(this._db, startTable), ...constraints);
      const startSnap = await getDocs(q);
      if (startSnap.empty) return [];

      const results = [];
      for (const startDoc of startSnap.docs) {
        const startData = startDoc.data();
        let merged = { ...startData };

        for (const join of joins) {
          const leftCol = join.leftKey.split('.')[1];
          const rightCol = join.rightKey.split('.')[1];
          const leftAlias = join.leftKey.split('.')[0];

          let lookupTable, lookupCol, lookupValue;
          if (aliasMap[leftAlias] === join.table) {
            lookupTable = join.table;
            lookupCol = leftCol;
            lookupValue = merged[rightCol];
          } else {
            lookupTable = join.table;
            lookupCol = rightCol;
            lookupValue = merged[leftCol] || startData[leftCol];
          }

          if (lookupValue !== undefined) {
            const jq = query(
              collection(this._db, lookupTable),
              where(lookupCol, '==', lookupValue)
            );
            const joinSnap = await getDocs(jq);
            for (const jDoc of joinSnap.docs) {
              merged = { ...merged, ...jDoc.data() };
            }
          }
        }

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

      return lim ? results.slice(0, lim) : results;
    }

    const snapshot = await getDocs(collection(this._db, fromMatch[1]));
    return snapshot.docs.map((d) => d.data());
  }

  // ─── Private: WHERE query builder ────────────────────────────

  async _whereQuery(table, whereClause, params, lim) {
    const isOr = /\bOR\b/i.test(whereClause);
    const parts = whereClause.split(/\s+(?:AND|OR)\s+/i);

    if (isOr) {
      const allDocs = new Map();
      for (let i = 0; i < parts.length; i++) {
        const colMatch = parts[i].match(/(\w+)\s*=\s*\?/);
        if (colMatch) {
          const constraints = [where(colMatch[1], '==', params[i])];
          if (lim) constraints.push(firestoreLimit(lim));
          const q = query(collection(this._db, table), ...constraints);
          const snap = await getDocs(q);
          for (const d of snap.docs) allDocs.set(d.id, d);
        }
      }
      return {
        empty: allDocs.size === 0,
        size: allDocs.size,
        docs: Array.from(allDocs.values()),
      };
    }

    const constraints = [];
    parts.forEach((part, i) => {
      const colMatch = part.match(/(\w+)\s*=\s*\?/);
      if (colMatch) {
        constraints.push(where(colMatch[1], '==', params[i]));
      }
    });
    if (lim) constraints.push(firestoreLimit(lim));

    const q = query(collection(this._db, table), ...constraints);
    return getDocs(q);
  }

  // ─── Private: helpers ──────────────────────────────────────

  _pickColumns(data, colsStr) {
    const cols = colsStr.split(',').map((c) => c.trim());
    const result = {};
    for (const col of cols) {
      const name = col.includes('.') ? col.split('.').pop() : col;
      if (data[name] !== undefined) result[name] = data[name];
    }
    return result;
  }

  async _nextId(table) {
    const counterRef = doc(this._db, '_counters', table);
    const counterSnap = await getDoc(counterRef);
    const current = counterSnap.exists() ? counterSnap.data().value : 0;
    const next = current + 1;
    await setDoc(counterRef, { value: next });
    return next;
  }
}

module.exports = FirestoreDB;

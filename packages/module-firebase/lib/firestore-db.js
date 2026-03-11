/**
 * Firestore adapter implementing the Stratum Standard Database Interface.
 *
 * Uses the Firebase JS SDK (modular v9+).
 * Maps structured method calls directly to Firestore operations —
 * no SQL parsing required.
 *
 * Interface: { exec, createTable, alterTable, dropTable, tableExists, listTables,
 *   select, selectAll, insert, insertMany, update, delete, deleteAll, upsert, count, exists, query }
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
  orderBy: firestoreOrderBy,
} = require('firebase/firestore');

class FirestoreDB {
  constructor(firestore) {
    this._db = firestore;
  }

  // ─── Schema ────────────────────────────────────────────

  exec() {}

  // Create table — store schema metadata in _schemas collection
  async createTable(table, columns) {
    const schemaRef = doc(this._db, '_schemas', table);
    await setDoc(schemaRef, { columns, createdAt: new Date().toISOString() });
  }

  // Alter table — update schema metadata
  async alterTable(table, changes) {
    if (!changes.add) return;
    const schemaRef = doc(this._db, '_schemas', table);
    const snap = await getDoc(schemaRef);
    const existing = snap.exists() ? snap.data().columns || {} : {};
    const merged = { ...existing, ...changes.add };
    await setDoc(schemaRef, { columns: merged, updatedAt: new Date().toISOString() }, { merge: true });
  }

  // Drop table — delete all documents in the collection
  async dropTable(table) {
    const snap = await getDocs(collection(this._db, table));
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
    // Remove schema metadata
    const schemaRef = doc(this._db, '_schemas', table);
    const schemaSnap = await getDoc(schemaRef);
    if (schemaSnap.exists()) {
      await deleteDoc(schemaRef);
    }
  }

  // Check if table/collection exists (has at least one document or schema)
  async tableExists(table) {
    const schemaRef = doc(this._db, '_schemas', table);
    const schemaSnap = await getDoc(schemaRef);
    if (schemaSnap.exists()) return true;
    const q = query(collection(this._db, table), firestoreLimit(1));
    const snap = await getDocs(q);
    return !snap.empty;
  }

  // List all tables — based on stored schemas
  async listTables() {
    const snap = await getDocs(collection(this._db, '_schemas'));
    return snap.docs.map((d) => d.id).sort();
  }

  // ─── Select single row ────────────────────────────────

  async select(table, whereObj, columns) {
    const constraints = this._buildConstraints(whereObj);
    constraints.push(firestoreLimit(1));

    const q = query(collection(this._db, table), ...constraints);
    const snap = await getDocs(q);
    if (snap.empty) return undefined;

    const data = snap.docs[0].data();
    return columns ? this._pick(data, columns) : data;
  }

  // ─── Select multiple rows ─────────────────────────────

  async selectAll(table, whereObj, options = {}) {
    const constraints = this._buildConstraints(whereObj);

    if (options.orderBy) {
      constraints.push(firestoreOrderBy(options.orderBy, options.order || 'asc'));
    }
    if (options.limit != null) {
      constraints.push(firestoreLimit(options.limit));
    }

    const q = constraints.length
      ? query(collection(this._db, table), ...constraints)
      : collection(this._db, table);
    const snap = await getDocs(q);

    let docs = snap.docs.map((d) => {
      const data = d.data();
      return options.columns ? this._pick(data, options.columns) : data;
    });

    if (options.offset) {
      docs = docs.slice(options.offset);
    }

    return docs;
  }

  // ─── Insert ───────────────────────────────────────────

  async insert(table, data) {
    const id = await this._nextId(table);
    const row = { ...data, id };

    if (!row.created_at && table === 'users') {
      row.created_at = new Date().toISOString();
    }

    await setDoc(doc(this._db, table, String(id)), row);
    return { id };
  }

  // ─── Bulk insert ───────────────────────────────────────

  async insertMany(table, rows) {
    if (!rows || rows.length === 0) return { count: 0 };
    let count = 0;
    for (const data of rows) {
      await this.insert(table, data);
      count++;
    }
    return { count };
  }

  // ─── Update ───────────────────────────────────────────

  async update(table, whereObj, data) {
    const constraints = this._buildConstraints(whereObj);
    const q = query(collection(this._db, table), ...constraints);
    const snap = await getDocs(q);

    let changes = 0;
    for (const d of snap.docs) {
      await updateDoc(d.ref, data);
      changes++;
    }
    return { changes };
  }

  // ─── Delete ───────────────────────────────────────────

  async delete(table, whereObj) {
    const constraints = this._buildConstraints(whereObj);
    const q = query(collection(this._db, table), ...constraints);
    const snap = await getDocs(q);

    let changes = 0;
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
      changes++;
    }
    return { changes };
  }

  // ─── Delete all rows ───────────────────────────────────

  async deleteAll(table) {
    const snap = await getDocs(collection(this._db, table));
    let changes = 0;
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
      changes++;
    }
    return { changes };
  }

  // ─── Upsert (insert-or-ignore) ────────────────────────

  async upsert(table, data, conflictKeys) {
    const constraints = conflictKeys.map((key) =>
      where(key, '==', data[key])
    );
    const q = query(
      collection(this._db, table),
      ...constraints,
      firestoreLimit(1)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      return { id: snap.docs[0].data().id || 0, changes: 0 };
    }

    // Composite-key tables use deterministic document ID
    let id;
    if (conflictKeys.length > 1) {
      id = conflictKeys.map((k) => data[k]).join('_');
    } else {
      id = await this._nextId(table);
    }

    const row = { ...data, id };
    await setDoc(doc(this._db, table, String(id)), row);
    return { id, changes: 1 };
  }

  // ─── Count ────────────────────────────────────────────

  async count(table, whereObj) {
    const constraints = this._buildConstraints(whereObj);
    const q = constraints.length
      ? query(collection(this._db, table), ...constraints)
      : collection(this._db, table);
    const snap = await getDocs(q);
    return snap.size;
  }

  // ─── Exists ───────────────────────────────────────────

  async exists(table, whereObj) {
    const constraints = this._buildConstraints(whereObj);
    constraints.push(firestoreLimit(1));
    const q = query(collection(this._db, table), ...constraints);
    const snap = await getDocs(q);
    return !snap.empty;
  }

  // ─── Escape hatch: raw query ──────────────────────────

  async query(_sql, _params) {
    throw new Error(
      'FirestoreDB does not support raw SQL queries. ' +
        'Use the structured methods (select, selectAll, insert, etc.) ' +
        'or access firebase.firestore directly for complex Firestore queries.'
    );
  }

  // ─── Private helpers ──────────────────────────────────

  _buildConstraints(whereObj) {
    if (!whereObj || Object.keys(whereObj).length === 0) return [];
    return Object.entries(whereObj).map(([key, value]) =>
      where(key, '==', value)
    );
  }

  _pick(data, columns) {
    const result = {};
    for (const col of columns) {
      if (data[col] !== undefined) result[col] = data[col];
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

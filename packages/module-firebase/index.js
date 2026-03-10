const { initializeApp, deleteApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');
const { getAuth } = require('firebase/auth');
const { getStorage } = require('firebase/storage');
const FirestoreDB = require('./lib/firestore-db');
const createAuthServices = require('./lib/firebase-auth');
const createStorageService = require('./lib/firebase-storage');

module.exports = {
  name: 'module-firebase',
  version: '1.0.0',
  dependencies: ['module-api'],

  async register(context) {
    // Initialize Firebase with the web app config
    // Config comes directly from Firebase Console → Project Settings → Your apps
    const firebaseConfig = { ...context.config };
    delete firebaseConfig.enabled;

    this._app = initializeApp(firebaseConfig, 'stratum-firebase');

    const firestore = getFirestore(this._app);
    const firebaseAuth = getAuth(this._app);

    // --- Always register namespaced Firebase services ---

    context.services.register('firebase.app', this._app);
    context.services.register('firebase.firestore', firestore);
    context.services.register('firebase.auth', firebaseAuth);

    // Storage (only if storageBucket is configured)
    if (firebaseConfig.storageBucket) {
      const storage = getStorage(this._app);
      const storageService = createStorageService(storage);
      context.services.register('firebase.storage', storageService);
    }

    // --- Coexistence: fill standard service slots if original modules are disabled ---

    if (!context.services.has('db')) {
      const firestoreDB = new FirestoreDB(firestore);
      context.services.register('db', firestoreDB);
      context.logger.info('Registered Firestore as "db" service (module-db-sqlite not loaded)');
    }

    if (!context.services.has('auth.requireAuth')) {
      const { verifyToken, requireAuth } = createAuthServices(
        firebaseAuth,
        firebaseConfig.projectId
      );
      context.services.register('auth.verifyToken', verifyToken);
      context.services.register('auth.requireAuth', requireAuth);
      context.logger.info(
        'Registered Firebase Auth as "auth.*" services (module-auth not loaded)'
      );
    }

    context.logger.info('Registered');
  },

  async init(context) {
    context.logger.info('Firebase initialized');
  },

  async start(context) {
    const registerRouter = context.services.get('api.registerRouter');
    const { Router } = require('express');
    const router = Router();

    // Storage routes (only if storage is configured)
    if (context.services.has('firebase.storage')) {
      const storage = context.services.get('firebase.storage');
      const requireAuth = context.services.get('auth.requireAuth');

      router.get('/files', requireAuth, async (req, res) => {
        try {
          const prefix = req.query.prefix || '';
          const files = await storage.list(prefix);
          res.json(files);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      router.delete('/files/:path(*)', requireAuth, async (req, res) => {
        try {
          await storage.delete(req.params.path);
          res.json({ message: 'File deleted' });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });
    }

    // Health check
    router.get('/health', async (req, res) => {
      try {
        const { getDocs, collection, limit, query } = require('firebase/firestore');
        const firestore = context.services.get('firebase.firestore');
        await getDocs(query(collection(firestore, '_health'), limit(1)));
        res.json({ status: 'ok', service: 'firebase' });
      } catch (err) {
        res.status(503).json({ status: 'error', error: err.message });
      }
    });

    registerRouter('/api/firebase', router);
  },

  async stop() {},

  async destroy(context) {
    if (this._app) {
      await deleteApp(this._app);
      context.logger.info('Firebase app deleted');
    }
  },
};

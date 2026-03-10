const path = require('path');
const admin = require('firebase-admin');
const FirestoreDB = require('./lib/firestore-db');
const createAuthServices = require('./lib/firebase-auth');
const createStorageService = require('./lib/firebase-storage');

module.exports = {
  name: 'module-firebase',
  version: '1.0.0',
  dependencies: ['module-api'],

  async register(context) {
    // Initialize Firebase Admin SDK
    const credentialPath = context.config.credential;
    const initOptions = {};

    if (typeof credentialPath === 'string') {
      const serviceAccount = require(path.resolve(credentialPath));
      initOptions.credential = admin.credential.cert(serviceAccount);
    } else if (typeof credentialPath === 'object') {
      initOptions.credential = admin.credential.cert(credentialPath);
    }
    // If no credential, uses GOOGLE_APPLICATION_CREDENTIALS env var or default credentials

    if (context.config.databaseURL) {
      initOptions.databaseURL = context.config.databaseURL;
    }
    if (context.config.storageBucket) {
      initOptions.storageBucket = context.config.storageBucket;
    }

    this._app = admin.initializeApp(initOptions, 'stratum-firebase');

    // --- Always register namespaced Firebase services ---

    const firestore = this._app.firestore();
    const adminAuth = this._app.auth();

    context.services.register('firebase.admin', this._app);
    context.services.register('firebase.firestore', firestore);
    context.services.register('firebase.auth', adminAuth);

    // Storage (only if bucket configured)
    if (context.config.storageBucket) {
      const bucket = this._app.storage().bucket();
      const storageService = createStorageService(bucket);
      context.services.register('firebase.storage', storageService);
    }

    // --- Coexistence: fill standard service slots if original modules are disabled ---

    // If module-db-sqlite is not loaded, register Firestore as the 'db' service
    if (!context.services.has('db')) {
      const firestoreDB = new FirestoreDB(firestore);
      context.services.register('db', firestoreDB);
      context.logger.info('Registered Firestore as "db" service (module-db-sqlite not loaded)');
    }

    // If module-auth is not loaded, register Firebase Auth as auth.* services
    if (!context.services.has('auth.requireAuth')) {
      const { verifyToken, requireAuth } = createAuthServices(adminAuth);
      context.services.register('auth.verifyToken', verifyToken);
      context.services.register('auth.requireAuth', requireAuth);
      context.logger.info(
        'Registered Firebase Auth as "auth.*" services (module-auth not loaded)'
      );
    }

    context.logger.info('Registered');
  },

  async init(context) {
    // Firestore is schemaless — no migrations needed
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

    // Health check for Firebase connection
    router.get('/health', async (req, res) => {
      try {
        // Quick Firestore connectivity test
        await context.services.get('firebase.firestore').listCollections();
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
      await this._app.delete();
      context.logger.info('Firebase app deleted');
    }
  },
};

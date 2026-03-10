module.exports = {
  modules: {
    '@stratum/module-db-sqlite': {
      enabled: true,
      options: {
        filename: './data/stratum.db',
      },
    },
    '@stratum/module-api': {
      enabled: true,
      options: {
        port: 3001,
        cors: true,
      },
    },
    '@stratum/module-auth': {
      enabled: true,
      options: {
        jwtSecret: 'change-me-in-production',
        tokenExpiry: '24h',
      },
    },
    '@stratum/module-rbac': {
      enabled: true,
      options: {
        defaultRole: 'user',
      },
    },
    '@stratum/module-dashboard': {
      enabled: true,
    },
    '@stratum/module-firebase': {
      enabled: false,
      options: {
        // Your web app's Firebase configuration
        // From Firebase Console → Project Settings → Your apps
        apiKey: 'your-api-key',
        authDomain: 'your-project.firebaseapp.com',
        projectId: 'your-project-id',
        storageBucket: 'your-project.firebasestorage.app',
        messagingSenderId: '123456789',
        appId: '1:123456789:web:abcdef',
        // measurementId: 'G-XXXXXXXXXX',
      },
    },
  },
};

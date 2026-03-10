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
        credential: './service-account.json',
        // databaseURL: 'https://<project>.firebaseio.com',
        // storageBucket: '<project>.appspot.com',
      },
    },
  },
};

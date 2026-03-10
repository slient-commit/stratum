const { Kernel } = require('@stratum/core');
const config = require('./stratum.config');

const kernel = new Kernel(config);

kernel.boot().catch((err) => {
  console.error('[stratum] Fatal error during boot:', err);
  process.exit(1);
});

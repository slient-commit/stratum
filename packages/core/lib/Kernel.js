const ConfigManager = require('./ConfigManager');
const ModuleLoader = require('./ModuleLoader');
const EventBus = require('./EventBus');
const ServiceRegistry = require('./ServiceRegistry');
const LifecycleManager = require('./LifecycleManager');

class Kernel {
  constructor(config) {
    this._config = new ConfigManager(config);
    this._events = new EventBus();
    this._services = new ServiceRegistry();
    this._loader = new ModuleLoader(this._config);
    this._lifecycle = new LifecycleManager(
      this._services,
      this._events,
      this._config
    );
    this._modules = [];
  }

  async boot() {
    console.log('[stratum] Booting...');

    // Load and sort modules
    const enabledNames = this._config.getEnabledModules();
    this._modules = this._loader.load(enabledNames);

    console.log(
      '[stratum] Modules loaded:',
      this._modules.map((m) => m.name).join(', ')
    );

    // Store module UI metadata for the API to serve
    const uiPlugins = this._modules
      .filter((m) => m.ui)
      .map((m) => ({ name: m.name, ...m.ui }));
    this._services.register('core.uiPlugins', uiPlugins);

    // Run lifecycle phases
    await this._lifecycle.runPhase(this._modules, 'register');
    await this._lifecycle.runPhase(this._modules, 'init');
    await this._lifecycle.runPhase(this._modules, 'start');

    console.log('[stratum] All modules started.');

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n[stratum] Shutting down...');
      await this._lifecycle.shutdown();
      this._events.removeAll();
      console.log('[stratum] Goodbye.');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

module.exports = Kernel;

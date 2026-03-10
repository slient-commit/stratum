class LifecycleManager {
  constructor(services, events, configManager) {
    this._services = services;
    this._events = events;
    this._configManager = configManager;
    this._started = [];
  }

  _createContext(mod) {
    return {
      config: this._configManager.getModuleConfig(
        `@stratum/${mod.name}`
      ),
      services: this._services,
      events: this._events,
      logger: {
        info: (...args) => console.log(`[${mod.name}]`, ...args),
        warn: (...args) => console.warn(`[${mod.name}]`, ...args),
        error: (...args) => console.error(`[${mod.name}]`, ...args),
        debug: (...args) => console.debug(`[${mod.name}]`, ...args),
      },
    };
  }

  async runPhase(modules, phase) {
    for (const mod of modules) {
      if (typeof mod[phase] === 'function') {
        const ctx = this._createContext(mod);
        await mod[phase](ctx);
      }
      if (phase === 'start') {
        this._started.push(mod);
      }
    }
  }

  async shutdown() {
    const reversed = [...this._started].reverse();
    for (const mod of reversed) {
      const ctx = this._createContext(mod);
      if (typeof mod.stop === 'function') {
        await mod.stop(ctx);
      }
      if (typeof mod.destroy === 'function') {
        await mod.destroy(ctx);
      }
    }
    this._started = [];
  }
}

module.exports = LifecycleManager;

class ConfigManager {
  constructor(rawConfig) {
    this._modules = {};
    for (const [name, cfg] of Object.entries(rawConfig.modules || {})) {
      this._modules[name] = {
        enabled: cfg.enabled !== false,
        options: cfg.options || {},
      };
    }
  }

  isEnabled(moduleName) {
    const cfg = this._modules[moduleName];
    return cfg ? cfg.enabled : false;
  }

  getModuleConfig(moduleName) {
    const cfg = this._modules[moduleName];
    return cfg ? { ...cfg.options } : {};
  }

  getEnabledModules() {
    return Object.entries(this._modules)
      .filter(([, cfg]) => cfg.enabled)
      .map(([name]) => name);
  }
}

module.exports = ConfigManager;

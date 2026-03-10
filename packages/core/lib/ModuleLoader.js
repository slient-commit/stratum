class ModuleLoader {
  constructor(configManager) {
    this._configManager = configManager;
  }

  load(moduleNames) {
    const modules = [];

    for (const name of moduleNames) {
      if (!this._configManager.isEnabled(name)) continue;

      let mod;
      try {
        mod = require(name);
      } catch (err) {
        throw new Error(`Failed to load module "${name}": ${err.message}`);
      }

      this._validate(name, mod);
      modules.push(mod);
    }

    return this._topoSort(modules);
  }

  _validate(packageName, mod) {
    if (!mod.name || typeof mod.name !== 'string') {
      throw new Error(`Module "${packageName}" must export a "name" string`);
    }
    if (!mod.version || typeof mod.version !== 'string') {
      throw new Error(`Module "${packageName}" must export a "version" string`);
    }
  }

  _topoSort(modules) {
    const byName = new Map();
    for (const mod of modules) {
      byName.set(mod.name, mod);
    }

    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (mod) => {
      if (visited.has(mod.name)) return;
      if (visiting.has(mod.name)) {
        throw new Error(`Circular dependency detected involving "${mod.name}"`);
      }

      visiting.add(mod.name);

      for (const depName of mod.dependencies || []) {
        const dep = byName.get(depName);
        if (!dep) {
          throw new Error(
            `Module "${mod.name}" depends on "${depName}" which is not loaded or enabled`
          );
        }
        visit(dep);
      }

      visiting.delete(mod.name);
      visited.add(mod.name);
      sorted.push(mod);
    };

    for (const mod of modules) {
      visit(mod);
    }

    return sorted;
  }
}

module.exports = ModuleLoader;

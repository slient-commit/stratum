class ServiceRegistry {
  constructor() {
    this._services = new Map();
  }

  register(name, implementation) {
    if (this._services.has(name)) {
      throw new Error(`Service "${name}" is already registered`);
    }
    this._services.set(name, implementation);
  }

  get(name) {
    const service = this._services.get(name);
    if (!service) {
      throw new Error(`Service "${name}" is not registered`);
    }
    return service;
  }

  has(name) {
    return this._services.has(name);
  }

  getAll() {
    return Object.fromEntries(this._services);
  }
}

module.exports = ServiceRegistry;

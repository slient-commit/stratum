class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  async emit(event, data) {
    const handlers = this._listeners.get(event) || [];
    for (const handler of handlers) {
      await handler(data);
    }
  }

  removeAll() {
    this._listeners.clear();
  }
}

module.exports = EventBus;

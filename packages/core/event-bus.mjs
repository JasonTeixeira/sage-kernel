export function createEventBus(sink = null) {
  const events = [];
  return {
    emit(event) {
      const entry = {
        ...event,
        at: event.at || new Date().toISOString()
      };
      events.push(entry);
      if (sink) sink(entry);
      return entry;
    },
    list() {
      return [...events];
    }
  };
}

/* storage.js – localStorage wrapper */
const Store = (() => {
  const KEY = "tripcraft.trips.v1";
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  };
  const write = (trips) => {
    try { localStorage.setItem(KEY, JSON.stringify(trips)); return true; } catch { return false; }
  };
  return {
    all: read,
    get: (id) => read().find(t => t.id === id),
    save(trip) {
      const trips = read();
      const i = trips.findIndex(t => t.id === trip.id);
      trip.updatedAt = Date.now();
      if (i >= 0) trips[i] = trip; else trips.unshift(trip);
      return write(trips);
    },
    remove(id) { write(read().filter(t => t.id !== id)); },
    uid: () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  };
})();

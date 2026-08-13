const store = new Map();

// Egyszerű TTL cache promise-okra, hogy egyidejű kérések ne dupláz(z)ák a fetchet,
// és a menum.hu API-t se hívjuk feleslegesen minden gombkattintásnál.
export function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value;

  const promise = Promise.resolve()
    .then(fn)
    .catch((err) => {
      store.delete(key);
      throw err;
    });

  store.set(key, { value: promise, expires: now + ttlMs });
  return promise;
}

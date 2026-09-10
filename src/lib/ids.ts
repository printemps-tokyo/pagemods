// Short ids for settings rows. They only have to be unique inside one
// settings document, so eight characters are plenty.

export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

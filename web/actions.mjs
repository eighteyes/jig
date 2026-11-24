// actions.mjs — named actions with key bindings and an undo stack.
// Responsibilities:
// - views register actions by name; keys bind to names, not to handlers
// - one keydown listener per page, ignored while typing in a field
// - undo: each action may return an inverse, `undo` pops and runs it
// - expose the binding list so the page can draw a key legend

export function createActions(target = document) {
  const handlers = new Map();   // name -> fn
  const titles = new Map();     // name -> legend text
  const keys = new Map();       // key -> name
  const history = [];

  function define(name, fn, title) {
    handlers.set(name, fn);
    if (title) titles.set(name, title);
    return api;
  }

  function bind(map) {
    for (const [key, name] of Object.entries(map)) keys.set(String(key), name);
    return api;
  }

  async function run(name, ...args) {
    if (name === 'undo') return undo();
    const fn = handlers.get(name);
    if (!fn) return;
    const inverse = await fn(...args);
    if (typeof inverse === 'function') history.push(inverse);
  }

  async function undo() {
    const inverse = history.pop();
    if (inverse) await inverse();
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    const name = keys.get(e.key);
    if (!name) return;
    e.preventDefault();
    run(name);
  }

  target.addEventListener('keydown', onKey);

  const api = {
    define,
    bind,
    run,
    undo,
    bindings: () => [...keys.entries()].map(([key, name]) => ({ key, name, title: titles.get(name) ?? name })),
    /** Bindings grouped by action, in bind order: [{ keys: [..], name, title }]. */
    legend: () => {
      const by = new Map();
      for (const [key, name] of keys) {
        if (!by.has(name)) by.set(name, { keys: [], name, title: titles.get(name) ?? name });
        by.get(name).keys.push(key);
      }
      return [...by.values()];
    },
    dispose: () => target.removeEventListener('keydown', onKey),
  };
  return api;
}

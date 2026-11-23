// actions.mjs — named actions with key bindings and an undo stack.
// Responsibilities:
// - views register actions by name; keys bind to names, not to handlers
// - one keydown listener per page, ignored while typing in a field
// - undo: each action may return an inverse, `undo` pops and runs it
// - expose the binding list so the page can draw a key legend

export function createActions(target = document) {
  const handlers = new Map();   // name -> fn
  const keys = new Map();       // key -> name
  const history = [];

  function define(name, fn) { handlers.set(name, fn); return api; }

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
    bindings: () => [...keys.entries()].map(([key, name]) => ({ key, name })),
    dispose: () => target.removeEventListener('keydown', onKey),
  };
  return api;
}

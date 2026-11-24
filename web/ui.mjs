// ui.mjs — small DOM helpers shared by every view.
// Responsibilities:
// - el(): create an element with class and text
// - badges(): the escalate flag and note line every item can carry
// - css(): add a view's stylesheet once
// - scrollIntoViewIfNeeded(): keep the focused card visible

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

/** Elements for an item's shared marks: escalate flag and note. Empty array when none. */
export function badges(item) {
  const out = [];
  if (item?.fields?.escalate) out.push(el('span', 'jig-esc', '⚑ escalated'));
  if (item?.fields?.note) out.push(el('div', 'jig-note', item.fields.note));
  return out;
}

const added = new Set();
/** Add a stylesheet for a view once per page. */
export function css(id, text) {
  if (added.has(id)) return;
  added.add(id);
  const s = el('style');
  s.dataset.view = id;
  s.textContent = text;
  document.head.append(s);
}

export function keepVisible(node) {
  if (!node) return;
  const r = node.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight - 60) node.scrollIntoView({ block: 'nearest' });
}

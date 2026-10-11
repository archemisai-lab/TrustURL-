// DOM rendering. Every user-influenced value is written with textContent or setAttribute on
// a fixed attribute list; innerHTML is never used.

const SVG_NS = 'http://www.w3.org/2000/svg';

// Lucide icon geometry (24x24 grid, outline style, stroke width 2).
const ICONS = {
  'shield-check': ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z', 'm9 12 2 2 4-4'],
  'circle-check': ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'm9 12 2 2 4-4'],
  'circle-x': ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'm15 9-6 6', 'm9 9 6 6'],
  'circle-help': ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'],
  info: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M12 16v-4', 'M12 8h.01'],
  'triangle-alert': ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  'lock-open': ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 9.9-1'],
  globe: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'],
  hash: ['M4 9h16', 'M4 15h16', 'M10 3 8 21', 'M16 3l-2 18'],
  search: ['M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'm21 21-4.3-4.3'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'],
  cloud: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
  code: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
  'list-checks': ['m3 17 2 2 4-4', 'm3 7 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  eye: ['M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  loader: ['M21 12a9 9 0 1 1-6.219-8.56'],
};

export function icon(name, className = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon ${className}`.trim());
  for (const d of ICONS[name] || ICONS.info) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const STATUS = {
  ok: { icon: 'circle-check', label: 'No issue found' },
  info: { icon: 'info', label: 'Note' },
  warn: { icon: 'triangle-alert', label: 'Warning' },
  risk: { icon: 'circle-x', label: 'Risk' },
  na: { icon: 'circle-help', label: 'Unavailable' },
};
const SOURCE_LABEL = { observation: 'Direct observation', reputation: 'Reputation service' };

export function renderReport(container, report) {
  container.replaceChildren();

  const overall = el('section', `card overall tone-${report.assessment.tone}`);
  overall.setAttribute('aria-labelledby', 'overall-title');
  const head = el('div', 'overall-head');
  head.append(icon(report.assessment.icon, 'overall-icon'));
  const headText = el('div');
  headText.append(el('p', 'section-label', 'Overall assessment'));
  const title = el('h2', 'overall-title', report.assessment.label);
  title.id = 'overall-title';
  headText.append(title);
  head.append(headText);
  overall.append(head, el('p', 'overall-summary', report.assessment.summary));

  const checks = el('section', 'card');
  checks.setAttribute('aria-labelledby', 'checks-title');
  const checksTitle = el('h3', 'card-title', 'Security checks');
  checksTitle.id = 'checks-title';
  const list = el('ul', 'checks');
  for (const c of report.checks) {
    const s = STATUS[c.status];
    const item = el('li', `check status-${c.status}`);
    item.append(icon(c.icon, 'check-icon'));
    const body = el('div', 'check-body');
    const row = el('div', 'check-row');
    row.append(el('h4', 'check-title', c.title));
    const badge = el('span', 'badge');
    badge.append(icon(s.icon), el('span', '', s.label));
    row.append(badge);
    body.append(row, el('p', 'check-summary', c.summary), el('p', 'check-source', SOURCE_LABEL[c.source]));
    item.append(body);
    list.append(item);
  }
  checks.append(checksTitle, list);

  const details = el('section', 'card');
  details.setAttribute('aria-labelledby', 'details-title');
  const detailsTitle = el('h3', 'card-title', 'Technical details');
  detailsTitle.id = 'details-title';
  const dl = el('dl', 'details');
  for (const [k, v] of report.details) {
    const row = el('div', 'detail-row');
    row.append(el('dt', '', k), el('dd', '', v));
    dl.append(row);
  }
  details.append(detailsTitle, dl);

  const next = el('section', 'card');
  next.setAttribute('aria-labelledby', 'next-title');
  const nextTitle = el('h3', 'card-title', 'Next steps');
  nextTitle.id = 'next-title';
  const steps = el('ul', 'next-steps');
  for (const s of report.nextSteps) steps.append(el('li', '', s));
  next.append(nextTitle, steps);

  container.append(overall, checks, details, next);
  container.hidden = false;
}

export function setLoading(button, loading) {
  const label = button.querySelector('.btn-label');
  button.disabled = loading;
  button.setAttribute('aria-busy', String(loading));
  button.classList.toggle('is-loading', loading);
  label.textContent = loading ? 'Analyzing' : 'Analyze URL';
}

export function showError(input, errorEl, message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

export function announce(message) {
  const region = document.getElementById('status');
  region.textContent = '';
  // Re-set on the next frame so screen readers announce repeated messages.
  requestAnimationFrame(() => { region.textContent = message; });
}

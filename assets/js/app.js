import './common.js';
import { parseUrl, describeUrl, addressForReputation } from './url-parser.js';
import {
  runLocalChecks, buildReputationCheck, buildCoverageCheck,
  buildAssessment, buildNextSteps, buildDetails,
} from './local-checks.js';
import { icon, renderReport, setLoading, showError, announce } from './ui.js';

const ENDPOINT = '/.netlify/functions/analyze';
const REQUEST_TIMEOUT_MS = 10000;
const KNOWN_MATCHES = new Set(['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION']);
const KNOWN_REASONS = new Set(['not_configured', 'rate_limited', 'timeout', 'provider_error', 'network', 'invalid_request']);

const form = document.getElementById('url-form');
const input = document.getElementById('url-input');
const button = document.getElementById('analyze-btn');
const errorEl = document.getElementById('url-error');
const reportEl = document.getElementById('report');

button.querySelector('.btn-icon').replaceChildren(icon('loader', 'spin'));

// Ask the server function for a reputation result. The server never fetches the URL itself.
// The response is validated here so a malformed reply can never be shown as a "checked" result.
async function fetchReputation(href) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: href }),
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return { status: 'unavailable', reason: 'network' };
    if (data.status === 'checked' && Array.isArray(data.matches) && typeof data.provider === 'string') {
      return { status: 'checked', provider: data.provider.slice(0, 60), matches: data.matches.filter((m) => KNOWN_MATCHES.has(m)) };
    }
    return { status: 'unavailable', reason: KNOWN_REASONS.has(data.reason) ? data.reason : 'network' };
  } catch (err) {
    return { status: 'unavailable', reason: err && err.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const parsed = parseUrl(input.value);
  if (!parsed.ok) {
    showError(input, errorEl, parsed.message);
    reportEl.hidden = true;
    announce(parsed.message);
    input.focus();
    return;
  }
  showError(input, errorEl, '');
  setLoading(button, true);
  announce('Analyzing the link.');

  const info = describeUrl(parsed);
  const reputationTarget = addressForReputation(info);
  const rep = await fetchReputation(reputationTarget.href);

  const checks = [...runLocalChecks(info), buildReputationCheck(rep), buildCoverageCheck(rep, reputationTarget.queryRemoved)];
  const assessment = buildAssessment(checks, rep);
  renderReport(reportEl, {
    assessment,
    checks,
    details: buildDetails(info, rep, reputationTarget.queryRemoved),
    nextSteps: buildNextSteps(assessment),
  });

  setLoading(button, false);
  announce(`Analysis complete. ${assessment.label}.`);
  reportEl.focus();
  reportEl.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
});

input.addEventListener('input', () => { if (!errorEl.hidden) showError(input, errorEl, ''); });

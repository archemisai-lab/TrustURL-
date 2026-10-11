'use strict';

// Server-side reputation lookup.
// SECURITY NOTES
// - The submitted URL is sent to Google Safe Browsing as DATA. This function never requests
//   the submitted URL itself, so it cannot be used for SSRF or crawling.
// - The API key lives only in the SAFE_BROWSING_API_KEY environment variable.
// - Full URLs and the key are never logged or returned; only short error categories are.

const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const PROVIDER = 'Google Safe Browsing';
const MAX_BODY_BYTES = 4096;
const MAX_URL_LENGTH = 2048;
const TIMEOUT_MS = 5000;
const THREAT_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'];

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const reply = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { ...BASE_HEADERS, ...extra },
  body: JSON.stringify(body),
});
const unavailable = (reason) => reply(200, { status: 'unavailable', reason });

// Independent server-side validation: absolute http(s) URL, no credentials, bounded length.
function validateUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) return null;
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname || url.username || url.password) return null;
  return url.href;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'method_not_allowed' }, { Allow: 'POST' });

  const contentType = (event.headers && event.headers['content-type']) || '';
  if (!contentType.toLowerCase().startsWith('application/json')) return reply(415, { error: 'unsupported_media_type' });

  let raw = event.body || '';
  if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return reply(413, { error: 'payload_too_large' });

  let payload;
  try { payload = JSON.parse(raw); } catch { return reply(400, { error: 'invalid_request' }); }
  const href = validateUrl(payload && payload.url);
  if (!href) return reply(400, { error: 'invalid_request' });

  const apiKey = process.env.SAFE_BROWSING_API_KEY;
  if (!apiKey) return unavailable('not_configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        client: { clientId: 'trusturl', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: THREAT_TYPES,
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: href }],
        },
      }),
    });

    if (response.status === 429) return unavailable('rate_limited');
    if (!response.ok) {
      console.error(`reputation provider returned HTTP ${response.status}`); // status only, no URL or key
      return unavailable('provider_error');
    }
    const data = await response.json();
    const found = Array.isArray(data.matches) ? data.matches.map((m) => m && m.threatType) : [];
    const matches = [...new Set(found.filter((t) => THREAT_TYPES.includes(t)))];
    return reply(200, { status: 'checked', provider: PROVIDER, matches });
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    console.error(`reputation lookup failed: ${timedOut ? 'timeout' : 'error'}`);
    return unavailable(timedOut ? 'timeout' : 'provider_error');
  } finally {
    clearTimeout(timer);
  }
};

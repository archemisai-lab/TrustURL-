// URL validation and normalization. Pure functions, no DOM access.
// The submitted URL is only ever parsed as data; it is never fetched or opened.

export const MAX_URL_LENGTH = 2048;

const SENSITIVE_PARAM_NAMES =
  /^(token|access_token|id_token|refresh_token|auth|authorization|key|api_key|apikey|secret|client_secret|password|passwd|pwd|session|sessionid|sid|code|sig|signature|otp|jwt|reset|reset_token)$/i;

const fail = (code, message) => ({ ok: false, code, message });

export function parseUrl(input) {
  const raw = String(input ?? '').trim();

  if (!raw) return fail('empty', 'Enter a link to analyze.');
  if (raw.length > MAX_URL_LENGTH) {
    return fail('too-long', `This link is longer than ${MAX_URL_LENGTH} characters, which is more than TrustURL can analyze.`);
  }
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) {
    return fail('whitespace', 'The link contains spaces or hidden characters. Paste it again without them.');
  }
  if (raw.includes('\\')) {
    // Browsers treat backslashes as slashes, which can hide the real destination.
    return fail('backslash', 'The link contains a backslash. Web addresses use forward slashes (/).');
  }
  if (!/^https?:\/\//i.test(raw)) {
    const hasOtherScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[^/]*:\d+(\/|$)/.test(raw);
    return fail(
      hasOtherScheme ? 'scheme' : 'no-scheme',
      hasOtherScheme
        ? 'Only http and https links can be analyzed.'
        : 'Start the link with http:// or https:// so the address is unambiguous.'
    );
  }
  // WHATWG parsing silently accepts "https:///host"; require exactly two slashes.
  if (/^https?:\/\/\//i.test(raw)) {
    return fail('malformed', 'The link has too many slashes after the protocol. Use http:// or https:// followed by the site name.');
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return fail('malformed', 'This does not look like a valid link. Check it for typos and paste it again.');
  }
  if (!url.hostname) return fail('no-host', 'The link has no site name after the protocol.');

  return { ok: true, url, raw };
}

export function describeUrl({ url, raw }) {
  const host = url.hostname; // lowercased and converted to ASCII (punycode) by URL
  const isIPv6 = host.startsWith('[');
  const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const labels = isIPv4 || isIPv6 ? [] : host.split('.').filter(Boolean);
  const authority = raw.replace(/^https?:\/\//i, '').split(/[/?#]/)[0];
  const queryKeys = [...url.searchParams.keys()];

  return {
    url,
    host,
    labels,
    isIPv4,
    isIPv6,
    isIp: isIPv4 || isIPv6,
    protocol: url.protocol.replace(':', ''),
    port: url.port,
    hasUserInfo: Boolean(url.username || url.password),
    usesNonAsciiHost: /[^\x00-\x7f]/.test(authority.slice(authority.lastIndexOf('@') + 1)),
    punycodeLabels: labels.filter((l) => l.startsWith('xn--')),
    totalLength: raw.length,
    queryKeys,
    sensitiveQueryKeys: [...new Set(queryKeys.filter((k) => SENSITIVE_PARAM_NAMES.test(k)))],
    hasFragment: Boolean(url.hash),
    embeddedUrlInQuery: /https?(:|%3a)(\/|%2f){2}/i.test(url.search + url.pathname),
  };
}

// Address shown to the user: no credentials, query or fragment (they may hold private data).
export function displayAddress(info) {
  return `${info.url.origin}${info.url.pathname}`;
}

// Address sent to the reputation service: never credentials or fragment. The query string
// is dropped too when it contains parameter names that look like secrets.
export function addressForReputation(info) {
  const copy = new URL(info.url.href);
  copy.username = '';
  copy.password = '';
  copy.hash = '';
  if (info.sensitiveQueryKeys.length > 0) copy.search = '';
  return { href: copy.href, queryRemoved: info.sensitiveQueryKeys.length > 0 };
}

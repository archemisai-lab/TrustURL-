// Local (in-browser) checks plus the logic that turns all findings into a report.
// Every check is labelled with its source: a direct observation of the URL text,
// or a result returned by an external reputation service. No heuristic is treated as proof.

const OBSERVATION = 'observation';
const REPUTATION = 'reputation';
const TLD_LIKE = new Set(['com', 'net', 'org', 'co', 'gov', 'edu', 'io', 'info']);

const THREAT_LABELS = {
  MALWARE: 'malware',
  SOCIAL_ENGINEERING: 'deceptive or phishing content',
  UNWANTED_SOFTWARE: 'unwanted software',
  POTENTIALLY_HARMFUL_APPLICATION: 'potentially harmful applications',
};

export const REASON_TEXT = {
  not_configured: 'No reputation API key is configured for this deployment.',
  rate_limited: 'The reputation service is rate limiting requests. Try again in a few minutes.',
  timeout: 'The reputation service did not respond in time.',
  provider_error: 'The reputation service returned an error.',
  network: 'The analysis service could not be reached. This is expected when the page runs as plain static files.',
  invalid_request: 'The analysis service rejected the request.',
};

const check = (id, icon, title, status, summary, source = OBSERVATION) => ({ id, icon, title, status, summary, source });

function isPrivateIp(info) {
  if (info.isIPv6) return /^\[(::1|f[cd]|fe80)/i.test(info.host);
  const [a, b] = info.host.split('.').map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

export function runLocalChecks(info) {
  const checks = [];

  checks.push(check('syntax', 'code', 'URL syntax', 'ok',
    'The link is a well-formed web address. The normalized form is shown under technical details.'));

  checks.push(info.protocol === 'https'
    ? check('https', 'lock', 'HTTPS', 'ok',
        'The connection to the site would be encrypted. This says nothing about whether the site itself is trustworthy.')
    : check('https', 'lock-open', 'HTTPS', 'warn',
        'The link uses plain HTTP, so anything you type or receive could be read or changed in transit.'));

  const hostNotes = [];
  let hostStatus = 'ok';
  if (info.labels.length >= 5) { hostNotes.push(`It has ${info.labels.length} parts separated by dots, which is more than most legitimate sites need.`); hostStatus = 'warn'; }
  if ((info.host.match(/-/g) || []).length >= 3) { hostNotes.push('It contains many hyphens, a pattern often used to imitate other names.'); hostStatus = 'warn'; }
  if (info.punycodeLabels.length || info.usesNonAsciiHost) { hostNotes.push('It uses international characters (shown in ASCII form below). Some letters from other alphabets look identical to Latin ones.'); hostStatus = 'warn'; }
  if (!info.isIp && info.labels.length === 1) { hostNotes.push('It has a single name with no domain ending, so it only works on a private network.'); if (hostStatus === 'ok') hostStatus = 'info'; }
  if (info.port && !info.isIp) { hostNotes.push(`It uses a non-standard port (${info.port}).`); if (hostStatus === 'ok') hostStatus = 'info'; }
  checks.push(check('host', 'globe', 'Hostname and domain structure', hostStatus,
    hostNotes.length ? hostNotes.join(' ') : 'The hostname has an ordinary structure. The site you would reach is the one named in the technical details.'));

  if (info.isIp) {
    checks.push(check('ip', 'hash', 'IP address instead of a name', isPrivateIp(info) ? 'info' : 'warn',
      isPrivateIp(info)
        ? 'The link points to an address on a local or private network, not to a public website.'
        : 'The link uses a numeric address instead of a site name. Legitimate services rarely do this, and it hides who runs the site.'));
  } else {
    checks.push(check('ip', 'hash', 'IP address instead of a name', 'ok', 'The link uses a site name, not a numeric address.'));
  }

  const patternNotes = [];
  let patternStatus = 'ok';
  const l = info.labels;
  if (l.some((label, i) => i < l.length - 2 && TLD_LIKE.has(label))) {
    patternNotes.push('A familiar domain ending (such as "com") appears in the middle of the hostname. This can make the address look like a different site.');
    patternStatus = 'warn';
  }
  if (info.embeddedUrlInQuery) { patternNotes.push('Another web address is embedded in the link, which can be used to redirect you elsewhere.'); if (patternStatus === 'ok') patternStatus = 'info'; }
  if (info.sensitiveQueryKeys.length) { patternNotes.push(`The link carries parameters that may hold private data (${info.sensitiveQueryKeys.join(', ')}). Their values are not shown or sent for analysis.`); if (patternStatus === 'ok') patternStatus = 'info'; }
  if (info.totalLength > 200) { patternNotes.push('The link is unusually long.'); if (patternStatus === 'ok') patternStatus = 'info'; }
  checks.push(check('patterns', 'search', 'Unusual or misleading patterns', patternStatus,
    patternNotes.length ? patternNotes.join(' ') : 'No misleading hostname patterns or unusual link features were found. This is a limited pattern check, not a guarantee.'));

  checks.push(info.hasUserInfo
    ? check('userinfo', 'user', 'Credentials or text before the @ sign', 'risk',
        `Text before an @ sign is not the site's name. This link would actually open ${info.host}. Attackers use this to make a link look like a different site.`)
    : check('userinfo', 'user', 'Credentials or text before the @ sign', 'ok', 'The link has no embedded username or password.'));

  return checks;
}

export function buildReputationCheck(rep) {
  if (rep.status === 'checked') {
    if (rep.matches.length) {
      const names = rep.matches.map((m) => THREAT_LABELS[m]).join(', ');
      return check('reputation', 'cloud', 'Reputation service', 'risk',
        `${rep.provider} lists this address as associated with: ${names}.`, REPUTATION);
    }
    return check('reputation', 'cloud', 'Reputation service', 'ok',
      `${rep.provider} has no match for this address. That means it is not on a known-threat list; it does not mean the site is harmless.`, REPUTATION);
  }
  return check('reputation', 'cloud', 'Reputation service', 'na',
    `Not checked. ${REASON_TEXT[rep.reason] || REASON_TEXT.network}`, REPUTATION);
}

export function buildCoverageCheck(rep, queryRemoved) {
  const notes = ['TrustURL never opens the link, so page content, redirects, certificates and domain age were not examined, and short links were not expanded.'];
  if (rep.status !== 'checked') notes.unshift('The external reputation check did not run.');
  if (queryRemoved) notes.push('Parameters that look private were left out of the reputation lookup.');
  return check('coverage', 'list-checks', 'Analysis coverage', rep.status === 'checked' ? 'info' : 'na', notes.join(' '));
}

export function buildAssessment(checks, rep) {
  const matched = rep.status === 'checked' && rep.matches.length > 0;
  const risk = checks.some((c) => c.status === 'risk');
  const warns = checks.filter((c) => c.status === 'warn').length;

  if (matched) {
    return { tone: 'risk', icon: 'circle-x', label: 'Potential risk detected',
      summary: 'A reputation service lists this address as dangerous. Do not open it.' };
  }
  if (risk || warns) {
    const n = checks.filter((c) => c.status === 'warn' || c.status === 'risk').length;
    return { tone: risk ? 'risk' : 'warn', icon: 'triangle-alert', label: 'Potential risk detected',
      summary: `${n === 1 ? 'One finding in the link itself deserves' : `${n} findings in the link itself deserve`} a closer look. These are warning signs, not proof that the site is malicious.` };
  }
  if (rep.status === 'checked') {
    return { tone: 'ok', icon: 'shield-check', label: 'No known threats detected',
      summary: 'The address is not on the reputation service\'s threat lists and the link shows no warning signs. New threats appear constantly, so this is not a guarantee of safety.' };
  }
  return { tone: 'neutral', icon: 'circle-help', label: 'Analysis incomplete',
    summary: 'The link shows no warning signs, but the external reputation check could not run. Without it, there is not enough evidence to say the link is free of known threats.' };
}

export function buildNextSteps(assessment) {
  if (assessment.tone === 'risk') return [
    'Do not open the link or enter any information on the page.',
    'Verify the sender or website through a channel you already trust, such as an official app or a number you looked up yourself.',
    'If you already opened it, avoid entering passwords, and change any password you used on that page.',
  ];
  if (assessment.tone === 'warn') return [
    'Avoid opening the link until you have confirmed where it came from.',
    'Go to the website by typing its name yourself or using a bookmark instead of this link.',
    'Be cautious about entering passwords or payment details on a page you reached through this link.',
  ];
  return [
    'Confirm the link came from someone or something you trust.',
    'Check that the site name in your browser matches the organization you expect before signing in.',
    'Be cautious about sharing passwords or payment details, even on sites that pass these checks.',
  ];
}

export function buildDetails(info, rep, queryRemoved) {
  const rows = [
    ['Hostname', info.host],
    ['Protocol', info.protocol.toUpperCase()],
    ['Port', info.port || 'Default'],
    ['Host type', info.isIp ? (info.isIPv6 ? 'IPv6 address' : 'IPv4 address') : `Domain name, ${info.labels.length} part${info.labels.length === 1 ? '' : 's'}`],
    ['Query parameters', info.queryKeys.length ? `${info.queryKeys.length} (values not shown)` : 'None'],
  ];
  if (info.hasUserInfo) rows.push(['Embedded credentials', 'Present (not shown)']);
  if (info.hasFragment) rows.push(['Fragment', 'Present (not shown)']);
  rows.push(['Reputation lookup', rep.status === 'checked' ? `Completed (${rep.provider})` : queryRemoved ? 'Not completed' : 'Not completed']);
  return rows;
}

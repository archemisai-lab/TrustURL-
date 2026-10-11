# TrustURL

**Know before you click.** TrustURL lets people paste a suspicious link and get a plain-language report on potential risks, without ever opening the link.

## What it does

- **Local checks (in the browser, no setup):** URL syntax and normalization (including international domain names, ports and IPv6), HTTPS vs HTTP, hostname structure, numeric IP addresses, misleading patterns (such as a domain ending in the middle of a hostname), embedded credentials before an `@`, and parameters whose names suggest private data.
- **Reputation check (server-side, optional):** a Netlify Function asks Google Safe Browsing whether the address is on a known-threat list. It requires an API key.
- Every finding is labelled **Direct observation** or **Reputation service**. The overall status is one of *No known threats detected*, *Potential risk detected* or *Analysis incomplete*. The app never says a link is "safe". "No known threats detected" appears only when the reputation service was successfully called and found nothing, and no local warning exists.

## Project structure

```
index.html, about.html, privacy.html, 404.html   pages
netlify.toml                                     publish dir, function dir, security headers, CSP
.env.example                                     placeholder only
assets/css/styles.css                            all styles; brand colors are :root variables
assets/js/app.js                                 form handling, calls the function
assets/js/url-parser.js                          validation and normalization
assets/js/local-checks.js                        checks, assessment and next-step logic
assets/js/ui.js                                  safe DOM rendering and Lucide icon paths
assets/js/common.js                              footer year (all pages)
assets/icons/logo.svg                            logo and favicon
netlify/functions/analyze.js                     reputation lookup
```

Because the publish directory is the project root (no build step), `netlify.toml` returns 404 for `/netlify/*`, `/README.md`, `/.env.example` and `/netlify.toml`.

## Run the frontend locally (local checks only)

ES modules need an HTTP server (opening the file directly will not work):

```
python3 -m http.server 8000     # then open http://localhost:8000
```

The report will show the reputation check as *Unavailable* because no function is running. That is expected.

## Run with Netlify Functions locally

1. Install the CLI: `npm install -g netlify-cli`.
2. Copy `.env.example` to `.env` and set `SAFE_BROWSING_API_KEY`.
3. Run `netlify dev` in the project root and open the printed address.

## Create the API key (Google Safe Browsing)

1. In Google Cloud Console, create or select a project.
2. Enable the **Safe Browsing API**.
3. Under *APIs & Services > Credentials*, create an **API key** and restrict it to the Safe Browsing API.

Limitations: the Safe Browsing Lookup API has usage quotas and its terms restrict commercial use (Google's Web Risk API is the commercial alternative). Check Google's current terms and quotas before relying on it. A "no match" result only means the address is not on Google's lists at that moment.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SAFE_BROWSING_API_KEY` | No | Enables the reputation check. Without it the app works with local checks only and says the reputation check is unavailable. |

## Deploy to Netlify

Recommended: unzip, push the folder to a Git repository, and import it in Netlify (**Add new site > Import an existing project**). Leave the build command empty. The publish directory and functions directory come from `netlify.toml`. Then add `SAFE_BROWSING_API_KEY` under *Site configuration > Environment variables* and redeploy.

Alternative: from the unzipped folder run `netlify deploy --prod` (CLI). Netlify's drag-and-drop uploader may not deploy Functions, so use Git or the CLI if you need the reputation check.

## Verify the deployment

- Open the site, analyze `https://example.com/`. With a valid key the Reputation service check reads *No issue found* and the overall status is *No known threats detected*. Without a key it reads *Unavailable* and the status is *Analysis incomplete*.
- Or call the function directly:
  `curl -X POST https://YOUR-SITE.netlify.app/.netlify/functions/analyze -H "Content-Type: application/json" -d '{"url":"https://example.com/"}'`
  Expect `{"status":"checked",...}` with a key, or `{"status":"unavailable","reason":"not_configured"}` without.

## What it can and cannot detect

Can: structural warning signs in the link text, and addresses that Google Safe Browsing already lists for malware, phishing, unwanted software or harmful applications.

Cannot: anything that requires visiting the link (page content, redirects, certificates, domain age), new threats that are not yet listed, or the real destination of short links (no shortener list is bundled, so shorteners are not detected). It does not replace antivirus software or professional threat intelligence. No single heuristic is treated as proof.

## Privacy and external submissions

- Local checks run in the browser.
- For the reputation check, the link is sent to the Netlify Function, which forwards it to Google Safe Browsing as data. The function never requests the submitted URL.
- Before sending, the client removes username, password and fragment, and drops the whole query string if any parameter name looks sensitive (token, key, session, password, and similar). The server independently rejects non-http(s) URLs, URLs with credentials, and oversize requests (4 KB body, 2048-character URL).
- No database, cookies, analytics or third-party scripts. The server logs only short error categories, never URLs or keys. Your host may keep its own request logs.
- Fonts: the interface asks for Inter and falls back to system fonts. Inter is not bundled; to self-host it, add a `woff2` file under `assets/` and an `@font-face` rule (the CSP already allows same-origin fonts).

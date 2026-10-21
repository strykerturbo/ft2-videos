#!/usr/bin/env python3
"""Keeps the page's Content-Security-Policy in step with its script.

index.html's policy allows exactly ONE inline script: the app itself, identified by its SHA-256 hash (no 'unsafe-inline').
So any edit to that script changes its hash, and the page would refuse to run it. Run this after every edit to index.html:

    python3 qa/update-csp-hash.py          # rewrites the hash in index.html
    python3 qa/update-csp-hash.py --check  # only checks (exit 1 if stale) -- the git pre-commit hook and QA test SEC-023 do this
"""
import base64, hashlib, re, sys, pathlib
path = pathlib.Path(__file__).resolve().parent.parent / 'index.html'
text = path.read_text(encoding='utf-8')
scripts = [m for m in re.finditer(r'<script>(.*?)</script>', text, re.S)]
if len(scripts) != 1:
    sys.exit('Expected exactly one inline <script> in index.html, found %d' % len(scripts))
digest = base64.b64encode(hashlib.sha256(scripts[0].group(1).encode('utf-8')).digest()).decode()
want = "'sha256-%s'" % digest
meta = re.search(r"(<meta http-equiv=\"Content-Security-Policy\" content=\")([^\"]*)(\")", text)
if not meta: sys.exit('No Content-Security-Policy meta tag found')
policy = meta.group(2)
m = re.search(r"script-src ([^;]*)", policy)
if not m: sys.exit('No script-src in the policy')
current = re.search(r"'sha256-[A-Za-z0-9+/=]+'", m.group(1))
if current and current.group(0) == want:
    print('CSP hash is up to date'); sys.exit(0)
if '--check' in sys.argv:
    print('CSP hash is STALE: run  python3 qa/update-csp-hash.py'); sys.exit(1)
new_src = re.sub(r"'sha256-[A-Za-z0-9+/=]+'", want, m.group(1)) if current else m.group(1).replace("'self'", "'self' " + want, 1)
new_policy = policy.replace(m.group(0), 'script-src ' + new_src, 1)
path.write_text(text[:meta.start(2)] + new_policy + text[meta.end(2):], encoding='utf-8')
print('CSP hash updated to', want)

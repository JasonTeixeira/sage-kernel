// Labeled security corpus (P5). Measures the security engines (SAST + taint +
// polyglot) against known-vulnerable AND known-safe samples, yielding real
// precision/recall instead of an asserted score. Safe samples are idiomatic-safe
// counterparts of each vulnerable pattern, so false positives are penalized.
//
// flagged = the engine produced >=1 finding for the sample.
//   vulnerable + flagged  -> true positive
//   vulnerable + clean    -> false negative (missed a real bug)
//   safe + flagged        -> false positive (cried wolf on safe code)
//   safe + clean          -> true negative

import { scanSastFile } from "./sast.mjs";
import { scanPolyglotFile } from "./polyglot-sast.mjs";

export const SECURITY_CORPUS = [
  // --- JS/TS: vulnerable ---
  { id: "js-cmd-injection-concat", lang: "js", vulnerable: true, code: "export function h(name){ execSync('rm -rf ' + name); }" },
  { id: "js-taint-shell", lang: "js", vulnerable: true, code: "export function h(req){ execSync(req.body.cmd); }" },
  { id: "js-dynamic-eval", lang: "js", vulnerable: true, code: "export function run(payload){ return eval(payload); }" },
  { id: "js-new-function", lang: "js", vulnerable: true, code: "export function mk(src){ return new Function(src); }" },
  { id: "js-taint-sql", lang: "js", vulnerable: true, code: "export function q(req){ return db.query('select * where id=' + req.params.id); }" },
  { id: "js-weak-hash-md5", lang: "js", vulnerable: true, code: "import crypto from 'node:crypto';\nexport const d = crypto.createHash('md5');" },
  // --- JS/TS: safe (idiomatic) ---
  { id: "js-safe-execfile", lang: "js", vulnerable: false, code: "export function h(name){ execFileSync('rm', ['-rf', name]); }" },
  { id: "js-safe-pathjoin", lang: "js", vulnerable: false, code: "import path from 'node:path';\nexport function r(base, name){ return path.join(base, name); }" },
  { id: "js-safe-jsonparse", lang: "js", vulnerable: false, code: "export function run(payload){ return JSON.parse(payload); }" },
  { id: "js-safe-sql-const", lang: "js", vulnerable: false, code: "export function q(){ return db.query('select 1'); }" },
  { id: "js-safe-sha256", lang: "js", vulnerable: false, code: "import crypto from 'node:crypto';\nexport const d = crypto.createHash('sha256');" },
  { id: "js-safe-plain", lang: "js", vulnerable: false, code: "export function add(a, b){ return a + b; }" },
  // --- Python: vulnerable ---
  { id: "py-os-system", lang: "py", vulnerable: true, code: "import os\ndef h(cmd):\n    os.system(cmd)\n" },
  { id: "py-shell-true", lang: "py", vulnerable: true, code: "import subprocess\ndef h(c):\n    subprocess.run(c, shell=True)\n" },
  { id: "py-eval", lang: "py", vulnerable: true, code: "def run(x):\n    return eval(x)\n" },
  { id: "py-pickle", lang: "py", vulnerable: true, code: "import pickle\ndef load(d):\n    return pickle.loads(d)\n" },
  { id: "py-yaml-unsafe", lang: "py", vulnerable: true, code: "import yaml\ndef load(s):\n    return yaml.load(s)\n" },
  { id: "py-tls-off", lang: "py", vulnerable: true, code: "import requests\ndef get(u):\n    return requests.get(u, verify=False)\n" },
  // --- Python: safe ---
  { id: "py-safe-list-args", lang: "py", vulnerable: false, code: "import subprocess\ndef h():\n    subprocess.run(['ls', '-l'])\n" },
  { id: "py-safe-yaml", lang: "py", vulnerable: false, code: "import yaml\ndef load(s):\n    return yaml.load(s, Loader=yaml.SafeLoader)\n" },
  { id: "py-safe-json", lang: "py", vulnerable: false, code: "import json\ndef load(s):\n    return json.loads(s)\n" },
  { id: "py-safe-sha256", lang: "py", vulnerable: false, code: "import hashlib\ndef d(x):\n    return hashlib.sha256(x)\n" },
  // --- Swift: vulnerable ---
  { id: "swift-uiwebview", lang: "swift", vulnerable: true, code: "let w = UIWebView()\n" },
  { id: "swift-md5", lang: "swift", vulnerable: true, code: "let h = Insecure.MD5.hash(data: d)\n" },
  { id: "swift-shell-interp", lang: "swift", vulnerable: true, code: "task.arguments = [\"/bin/sh\", \"-c\", \"\\(userCmd)\"]\n" },
  // --- Swift: safe ---
  { id: "swift-safe-wkwebview", lang: "swift", vulnerable: false, code: "let w = WKWebView()\n" },
  { id: "swift-safe-sha256", lang: "swift", vulnerable: false, code: "let h = SHA256.hash(data: d)\n" },

  // === Expanded OWASP-category coverage (vulnerable) ===
  { id: "js-template-shell", lang: "js", vulnerable: true, code: "export function h(n){ execSync(`ls ${n}`); }" },
  { id: "js-new-function", lang: "js", vulnerable: true, code: "export const f = new Function('a', 'return run(a)');" },
  { id: "js-ssrf-concat", lang: "js", vulnerable: true, code: "import http from 'node:http';\nexport function f(u){ return http.get('http://api/' + u); }" },
  { id: "js-path-traversal", lang: "js", vulnerable: true, code: "import fs from 'node:fs';\nexport function r(name){ return fs.readFileSync('uploads/' + name); }" },
  { id: "js-proto-pollution-literal", lang: "js", vulnerable: true, code: "export function set(o, v){ o['__proto__'] = v; }" },
  { id: "js-weak-cipher-des", lang: "js", vulnerable: true, code: "import crypto from 'node:crypto';\nexport const c = crypto.createCipher('des', k);" },
  { id: "js-insecure-random-token", lang: "js", vulnerable: true, code: "export const sessionToken = Math.random().toString(36).slice(2);" },
  { id: "js-timer-string", lang: "js", vulnerable: true, code: "setTimeout('runJob()', 50);" },
  { id: "py-exec", lang: "py", vulnerable: true, code: "def run(code):\n    exec(code)\n" },
  { id: "py-popen-shell", lang: "py", vulnerable: true, code: "import subprocess\ndef h(c):\n    subprocess.Popen(c, shell=True)\n" },
  { id: "py-weak-sha1", lang: "py", vulnerable: true, code: "import hashlib\ndef d(x):\n    return hashlib.sha1(x)\n" },
  { id: "swift-webview-html", lang: "swift", vulnerable: true, code: "webView.loadHTMLString(\"<b>\\(userHtml)</b>\", baseURL: nil)\n" },
  { id: "swift-keychain-always", lang: "swift", vulnerable: true, code: "query[kSecAttrAccessibleAlways as String] = true\n" },

  // === Expanded coverage (safe — stress false positives) ===
  { id: "js-safe-http-const", lang: "js", vulnerable: false, code: "import http from 'node:http';\nexport function f(){ return http.get('http://api/health'); }" },
  { id: "js-safe-path-join", lang: "js", vulnerable: false, code: "import fs from 'node:fs';\nimport path from 'node:path';\nexport function r(base, name){ return fs.readFileSync(path.join(base, name)); }" },
  { id: "js-safe-map-set", lang: "js", vulnerable: false, code: "export function set(m, k, v){ m.set(k, v); }" },
  { id: "js-safe-static-prop", lang: "js", vulnerable: false, code: "export function set(o, v){ o.value = v; }" },
  { id: "js-safe-cipheriv", lang: "js", vulnerable: false, code: "import crypto from 'node:crypto';\nexport const c = crypto.createCipheriv('aes-256-gcm', key, iv);" },
  { id: "js-safe-randombytes", lang: "js", vulnerable: false, code: "import crypto from 'node:crypto';\nexport const token = crypto.randomBytes(32).toString('hex');" },
  { id: "js-safe-settimeout-fn", lang: "js", vulnerable: false, code: "setTimeout(() => runJob(), 50);" },
  { id: "js-safe-math-random-ui", lang: "js", vulnerable: false, code: "export const jitter = Math.random() * 100;" },
  { id: "py-safe-popen-list", lang: "py", vulnerable: false, code: "import subprocess\ndef h():\n    subprocess.Popen(['ls', '-l'])\n" },
  { id: "py-safe-sha1-checksum", lang: "py", vulnerable: false, code: "import hashlib\ndef cs(x):\n    return hashlib.sha256(x)\n" },
  { id: "swift-safe-html-static", lang: "swift", vulnerable: false, code: "webView.loadHTMLString(\"<b>static</b>\", baseURL: nil)\n" },

  // === OWASP-category batch 2: vulnerable ===
  { id: "js-exec-concat-curl", lang: "js", vulnerable: true, code: "export function dl(url){ exec('curl ' + url); }" },
  { id: "js-exec-template-git", lang: "js", vulnerable: true, code: "import cp from 'node:child_process';\nexport function co(b){ cp.exec(`git checkout ${b}`); }" },
  { id: "js-eval-concat", lang: "js", vulnerable: true, code: "export function p(json){ return eval('(' + json + ')'); }" },
  { id: "js-writefile-traversal", lang: "js", vulnerable: true, code: "import fs from 'node:fs';\nexport function w(name, data){ fs.writeFileSync('logs/' + name, data); }" },
  { id: "js-proto-constructor", lang: "js", vulnerable: true, code: "export function set(o, v){ o['constructor'] = v; }" },
  { id: "js-weak-cipher-rc4", lang: "js", vulnerable: true, code: "import crypto from 'node:crypto';\nexport const c = crypto.createCipher('rc4', k);" },
  { id: "js-interval-string", lang: "js", vulnerable: true, code: "setInterval('tick()', 1000);" },
  { id: "js-ssrf-https", lang: "js", vulnerable: true, code: "import https from 'node:https';\nexport function f(host){ return https.request('http://' + host + '/x'); }" },
  { id: "js-taint-eval-alias", lang: "js", vulnerable: true, code: "export function h(req){ const c = req.body.cmd; eval(c); }" },
  { id: "py-os-system-concat", lang: "py", vulnerable: true, code: "import os\ndef ping(host):\n    os.system('ping ' + host)\n" },
  { id: "py-subprocess-call-shell", lang: "py", vulnerable: true, code: "import subprocess\ndef h(c):\n    subprocess.call(c, shell=True)\n" },
  { id: "py-requests-post-noverify", lang: "py", vulnerable: true, code: "import requests\ndef p(u, d):\n    return requests.post(u, data=d, verify=False)\n" },
  { id: "swift-cc-md5", lang: "swift", vulnerable: true, code: "CC_MD5(data, len, &digest)\n" },

  // === OWASP-category batch 2: safe (adversarial — must NOT flag) ===
  { id: "js-safe-execfile-curl", lang: "js", vulnerable: false, code: "import cp from 'node:child_process';\nexport function dl(url){ cp.execFileSync('curl', ['-s', url]); }" },
  { id: "js-safe-eval-jsonparse", lang: "js", vulnerable: false, code: "export function p(json){ return JSON.parse(json); }" },
  { id: "js-safe-writefile-resolve", lang: "js", vulnerable: false, code: "import fs from 'node:fs';\nimport path from 'node:path';\nexport function w(base, name, data){ fs.writeFileSync(path.resolve(base, name), data); }" },
  { id: "js-safe-constructor-read", lang: "js", vulnerable: false, code: "export function nameOf(o){ return o.constructor.name; }" },
  { id: "js-safe-cipheriv-128", lang: "js", vulnerable: false, code: "import crypto from 'node:crypto';\nexport const c = crypto.createCipheriv('aes-128-gcm', key, iv);" },
  { id: "js-safe-interval-fn", lang: "js", vulnerable: false, code: "setInterval(() => tick(), 1000);" },
  { id: "js-safe-https-const", lang: "js", vulnerable: false, code: "import https from 'node:https';\nexport function f(){ return https.request('https://api.internal/health'); }" },
  { id: "js-safe-randomuuid", lang: "js", vulnerable: false, code: "import crypto from 'node:crypto';\nexport const id = crypto.randomUUID();" },
  { id: "js-safe-random-arraypick", lang: "js", vulnerable: false, code: "export function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }" },
  { id: "js-safe-sanitized-exec", lang: "js", vulnerable: false, code: "import cp from 'node:child_process';\nexport function h(req){ const c = sanitize(req.body.cmd); cp.execFileSync('git', [c]); }" },
  { id: "py-safe-subprocess-curl-list", lang: "py", vulnerable: false, code: "import subprocess\ndef dl(url):\n    subprocess.run(['curl', '-s', url])\n" },
  { id: "py-safe-requests-verify-default", lang: "py", vulnerable: false, code: "import requests\ndef g(u):\n    return requests.get(u)\n" },
  { id: "swift-safe-sha512", lang: "swift", vulnerable: false, code: "let h = SHA512.hash(data: d)\n" }
];

const EXT = { js: "sample.mjs", py: "sample.py", swift: "sample.swift" };

function findingsFor(sample) {
  if (sample.lang === "js") return scanSastFile(EXT.js, sample.code);
  return scanPolyglotFile(EXT[sample.lang], sample.code);
}

export function scoreSecurityCorpus(options = {}) {
  const corpus = options.corpus || SECURITY_CORPUS;
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  const misses = [];
  for (const sample of corpus) {
    const flagged = findingsFor(sample).length > 0;
    if (sample.vulnerable && flagged) tp += 1;
    else if (sample.vulnerable && !flagged) { fn += 1; misses.push({ id: sample.id, kind: "false_negative" }); }
    else if (!sample.vulnerable && flagged) { fp += 1; misses.push({ id: sample.id, kind: "false_positive" }); }
    else tn += 1;
  }
  const precision = tp + fp ? Number((tp / (tp + fp)).toFixed(4)) : 1;
  const recall = tp + fn ? Number((tp / (tp + fn)).toFixed(4)) : 1;
  const f1 = precision + recall ? Number(((2 * precision * recall) / (precision + recall)).toFixed(4)) : 0;
  return { total: corpus.length, tp, fp, tn, fn, precision, recall, f1, misses };
}

// HELD-OUT security corpus: samples the SAST/taint engine was NOT authored
// against. Perfect precision/recall on the authored corpus only proves the engine
// matches its own examples; this set measures GENERALIZATION to real-world
// patterns (distinct phrasings + categories the tuned rules may not cover). The
// honest expectation is recall < 1.0 here — that gap is the real signal.
//
// Same labeling contract as corpus.mjs: vulnerable:true should be flagged.

export const HOLDOUT_CORPUS = [
  // --- JS vulnerable (real-world variants) ---
  { id: "ho-js-spawn-shell", lang: "js", vulnerable: true, code: "import cp from 'node:child_process';\nexport function h(req){ cp.spawn(req.body.cmd, { shell: true }); }" },
  { id: "ho-js-spawnsync-concat", lang: "js", vulnerable: true, code: "import cp from 'node:child_process';\nexport function h(name){ cp.spawnSync('sh', ['-c', 'cat ' + name]); }" },
  { id: "ho-js-dynamic-require", lang: "js", vulnerable: true, code: "export function load(req){ return require(req.query.mod); }" },
  { id: "ho-js-vm-run", lang: "js", vulnerable: true, code: "import vm from 'node:vm';\nexport function run(src){ return vm.runInNewContext(src); }" },
  { id: "ho-js-sql-template", lang: "js", vulnerable: true, code: "export function q(req){ return db.query(`select * from u where id=${req.params.id}`); }" },
  { id: "ho-js-readfile-req", lang: "js", vulnerable: true, code: "import fs from 'node:fs';\nexport function h(req,res){ res.send(fs.readFileSync(req.params.file)); }" },
  { id: "ho-js-sha1", lang: "js", vulnerable: true, code: "import crypto from 'node:crypto';\nexport const d = crypto.createHash('sha1');" },
  { id: "ho-js-exec-env-concat", lang: "js", vulnerable: true, code: "import { execSync } from 'node:child_process';\nexport function r(){ execSync('echo ' + process.env.USER_INPUT); }" },
  { id: "ho-js-settimeout-string", lang: "js", vulnerable: true, code: "export function s(code){ setTimeout(code, 100); }" },
  { id: "ho-js-proto-merge", lang: "js", vulnerable: true, code: "export function merge(t, s){ for (const k in s) t[k] = s[k]; return t; }\nexport function bad(o){ o.__proto__.polluted = 1; }" },
  // --- JS safe (idiomatic variants that must NOT flag) ---
  { id: "ho-js-safe-spawn-list", lang: "js", vulnerable: false, code: "import cp from 'node:child_process';\nexport function h(name){ cp.spawnSync('cat', [name]); }" },
  { id: "ho-js-safe-param-sql", lang: "js", vulnerable: false, code: "export function q(req){ return db.query('select * from u where id=$1', [req.params.id]); }" },
  { id: "ho-js-safe-readfile-basename", lang: "js", vulnerable: false, code: "import fs from 'node:fs';\nimport path from 'node:path';\nexport function h(req){ return fs.readFileSync(path.join('safe', path.basename(req.params.file))); }" },
  { id: "ho-js-safe-sha512", lang: "js", vulnerable: false, code: "import crypto from 'node:crypto';\nexport const d = crypto.createHash('sha512');" },
  { id: "ho-js-safe-timingsafe", lang: "js", vulnerable: false, code: "import crypto from 'node:crypto';\nexport function eq(a,b){ return crypto.timingSafeEqual(a,b); }" },
  { id: "ho-js-safe-settimeout-fn", lang: "js", vulnerable: false, code: "export function s(fn){ setTimeout(fn, 100); }" },
  { id: "ho-js-safe-static-require", lang: "js", vulnerable: false, code: "export function load(){ return require('node:path'); }" },
  // --- Python vulnerable ---
  { id: "ho-py-popen-shell", lang: "py", vulnerable: true, code: "import subprocess\ndef h(c):\n    subprocess.Popen(c, shell=True)\n" },
  { id: "ho-py-ospopen", lang: "py", vulnerable: true, code: "import os\ndef h(c):\n    return os.popen(c).read()\n" },
  { id: "ho-py-dynamic-import", lang: "py", vulnerable: true, code: "def load(name):\n    return __import__(name)\n" },
  { id: "ho-py-md5-hashlib", lang: "py", vulnerable: true, code: "import hashlib\ndef d(x):\n    return hashlib.md5(x).hexdigest()\n" },
  { id: "ho-py-exec-concat", lang: "py", vulnerable: true, code: "def r(name):\n    exec('handle_' + name + '()')\n" },
  { id: "ho-py-flask-render-string", lang: "py", vulnerable: true, code: "from flask import render_template_string\ndef v(req):\n    return render_template_string(req.args['tpl'])\n" },
  // --- Python safe ---
  { id: "ho-py-safe-secrets", lang: "py", vulnerable: false, code: "import secrets\ndef t():\n    return secrets.token_hex(32)\n" },
  { id: "ho-py-safe-run-list", lang: "py", vulnerable: false, code: "import subprocess\ndef h(name):\n    subprocess.run(['cat', name])\n" },
  { id: "ho-py-safe-sha256", lang: "py", vulnerable: false, code: "import hashlib\ndef d(x):\n    return hashlib.sha256(x).hexdigest()\n" },
  // --- Swift ---
  { id: "ho-swift-md5-cc", lang: "swift", vulnerable: true, code: "let h = Insecure.MD5.hash(data: payload)\n" },
  { id: "ho-swift-safe-sha256", lang: "swift", vulnerable: false, code: "let h = SHA256.hash(data: payload)\n" }
];

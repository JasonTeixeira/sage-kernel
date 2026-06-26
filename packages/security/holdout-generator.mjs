// Fresh held-out generator (anti-overfit). Produces genuinely NOVEL labeled
// security samples each round by varying the SURFACE of known vulnerability
// classes — identifier names, literal casing, whitespace, and wrapping — so the
// measurement stresses the engine's STRUCTURAL robustness rather than its memory
// of fixed strings. A different seed yields different code; the label is known by
// construction. (Honest scope: this varies surface form across classes the engine
// already targets — it catches literal/regex brittleness and false-positive drift,
// it does NOT invent unknown vulnerability classes.)

// Deterministic PRNG (mulberry32) so a round's set is reproducible from its seed.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const ident = (r) => pick(r, ["x", "v", "val", "data", "input", "arg", "name", "p", "n", "s", "t", "raw", "item", "req2", "u", "h"]);
// Avoid language keywords / builtins (eval/exec/import) as function names — they
// would be a generator artifact, not a real finding.
const fn = (r) => pick(r, ["handle", "runner", "processIt", "doIt", "loader", "applyIt", "go", "work", "fnA", "step", "perform"]);

// Each family yields a vulnerable and a safe variant of the same class, surface-varied.
const FAMILIES = [
  { // command injection via shell concat
    vuln: (r) => { const f = fn(r), a = ident(r); return { lang: "js", code: `import { execSync } from 'node:child_process';\nexport function ${f}(${a}){ execSync('ls ' + ${a}); }` }; },
    safe: (r) => { const f = fn(r), a = ident(r); return { lang: "js", code: `import { execFileSync } from 'node:child_process';\nexport function ${f}(${a}){ execFileSync('ls', [${a}]); }` }; }
  },
  { // sh -c dynamic payload
    vuln: (r) => { const f = fn(r), a = ident(r); return { lang: "js", code: `import cp from 'node:child_process';\nexport function ${f}(${a}){ cp.spawnSync('${pick(r, ["sh", "bash", "/bin/sh"])}', ['-c', 'cat ' + ${a}]); }` }; },
    safe: (r) => { const f = fn(r), a = ident(r); return { lang: "js", code: `import cp from 'node:child_process';\nexport function ${f}(${a}){ cp.spawnSync('cat', [${a}]); }` }; }
  },
  { // dynamic eval / new Function / vm
    vuln: (r) => { const f = fn(r), a = ident(r); return { lang: "js", code: pick(r, [`export function ${f}(${a}){ return eval(${a}); }`, `export const ${f} = (${a}) => new Function(${a});`, `import vm from 'node:vm';\nexport function ${f}(${a}){ return vm.runInNewContext(${a}); }`]) }; },
    safe: (r) => { const f = fn(r), a = ident(r); return { lang: "js", code: `export function ${f}(${a}){ return JSON.parse(${a}); }` }; }
  },
  { // dynamic require / import
    vuln: (r) => { const f = fn(r), a = ident(r); return { lang: "js", code: pick(r, [`export function ${f}(${a}){ return require(${a}); }`, `export async function ${f}(${a}){ return import(${a}); }`]) }; },
    safe: (r) => { const f = fn(r); return { lang: "js", code: `export function ${f}(){ return require('node:path'); }` }; }
  },
  { // path traversal: request-tainted fs path
    vuln: (r) => { const f = fn(r); return { lang: "js", code: `import fs from 'node:fs';\nexport function ${f}(req){ return fs.readFileSync('uploads/' + req.params.name); }` }; },
    safe: (r) => { const f = fn(r); return { lang: "js", code: `import fs from 'node:fs';\nimport path from 'node:path';\nexport function ${f}(req){ return fs.readFileSync(path.join('uploads', path.basename(req.params.name))); }` }; }
  },
  { // weak hash (casing varied)
    vuln: (r) => { const f = fn(r); return { lang: "js", code: `import crypto from 'node:crypto';\nexport const ${f} = crypto.createHash('${pick(r, ["md5", "sha1"])}');` }; },
    safe: (r) => { const f = fn(r); return { lang: "js", code: `import crypto from 'node:crypto';\nexport const ${f} = crypto.createHash('${pick(r, ["sha256", "sha512"])}');` }; }
  },
  { // weak cipher / insecure random token
    vuln: (r) => { const f = fn(r); return { lang: "js", code: pick(r, [`import crypto from 'node:crypto';\nexport const ${f} = crypto.createCipher('aes-256-cbc', k);`, `export const sessionToken = Math.random().toString(36).slice(2);`]) }; },
    safe: (r) => { const f = fn(r); return { lang: "js", code: pick(r, [`import crypto from 'node:crypto';\nexport const ${f} = crypto.createCipheriv('aes-256-gcm', key, iv);`, `import crypto from 'node:crypto';\nexport const token = crypto.randomBytes(32).toString('hex');`]) }; }
  },
  { // SSRF: interpolated request URL
    vuln: (r) => { const f = fn(r), a = ident(r); return { lang: "js", code: `import https from 'node:https';\nexport function ${f}(${a}){ return https.request('http://' + ${a} + '/x'); }` }; },
    safe: (r) => { const f = fn(r); return { lang: "js", code: `import https from 'node:https';\nexport function ${f}(){ return https.request('https://api.internal/health'); }` }; }
  },
  { // prototype pollution
    vuln: (r) => { const f = fn(r), a = ident(r); return { lang: "js", code: pick(r, [`export function ${f}(o, ${a}){ o['__proto__'] = ${a}; }`, `export function ${f}(o, ${a}){ o.__proto__.tainted = ${a}; }`]) }; },
    safe: (r) => { const f = fn(r), a = ident(r); return { lang: "js", code: `export function ${f}(o, ${a}){ o.value = ${a}; }` }; }
  },
  { // python command exec
    vuln: (r) => { const f = fn(r), a = ident(r); return { lang: "py", code: pick(r, [`import os\ndef ${f}(${a}):\n    os.system(${a})\n`, `import os\ndef ${f}(${a}):\n    return os.popen(${a}).read()\n`, `import subprocess\ndef ${f}(${a}):\n    subprocess.Popen(${a}, shell=True)\n`]) }; },
    safe: (r) => { const f = fn(r), a = ident(r); return { lang: "py", code: `import subprocess\ndef ${f}(${a}):\n    subprocess.run(['cat', ${a}])\n` }; }
  },
  { // python eval / dynamic import / deserialization
    vuln: (r) => { const f = fn(r), a = ident(r); return { lang: "py", code: pick(r, [`def ${f}(${a}):\n    return eval(${a})\n`, `def ${f}(${a}):\n    return __import__(${a})\n`, `import pickle\ndef ${f}(${a}):\n    return pickle.loads(${a})\n`]) }; },
    safe: (r) => { const f = fn(r), a = ident(r); return { lang: "py", code: `import json\ndef ${f}(${a}):\n    return json.loads(${a})\n` }; }
  },
  { // python weak hash / tls off
    vuln: (r) => { const f = fn(r), a = ident(r); return { lang: "py", code: pick(r, [`import hashlib\ndef ${f}(${a}):\n    return hashlib.md5(${a}).hexdigest()\n`, `import requests\ndef ${f}(${a}):\n    return requests.get(${a}, verify=False)\n`]) }; },
    safe: (r) => { const f = fn(r), a = ident(r); return { lang: "py", code: `import hashlib\ndef ${f}(${a}):\n    return hashlib.sha256(${a}).hexdigest()\n` }; }
  }
];

// Generate a fresh labeled corpus from a seed: one vuln + one safe per family,
// repeated `rounds` times with surface variation (so n = families * 2 * rounds).
export function generateHoldout(seed = 1, rounds = 2) {
  const r = rng(seed);
  const samples = [];
  for (let rep = 0; rep < rounds; rep += 1) {
    FAMILIES.forEach((fam, i) => {
      const v = fam.vuln(r); samples.push({ id: `gen-${seed}-${rep}-${i}-v`, lang: v.lang, vulnerable: true, code: v.code });
      const s = fam.safe(r); samples.push({ id: `gen-${seed}-${rep}-${i}-s`, lang: s.lang, vulnerable: false, code: s.code });
    });
  }
  return samples;
}

export function familyCount() { return FAMILIES.length; }

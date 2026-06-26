import test from "node:test";
import assert from "node:assert/strict";
import { registerPlugin, resetPlugins } from "../packages/plugins/registry.mjs";
import { scanSastFile } from "../packages/security/sast.mjs";

// P4: a registered LANGUAGE plugin genuinely EXTENDS analysis. We use a tiny DSL
// the built-in JS/TS parser CANNOT read; without a plugin SAST sees nothing, with
// the plugin (which compiles the DSL to an ESTree the SAST walkers understand)
// SAST finds the injection. This proves language plugins are load-bearing, not
// inert — routed through parseByExtension into the real engine.

const DSL = "shell: rm -rf {{ userInput }}\n";

// The plugin compiles the DSL into a minimal ESTree: execSync('rm -rf ' + userInput)
function compileDsl() {
  return {
    type: "Program",
    body: [{
      type: "ExpressionStatement",
      expression: {
        type: "CallExpression",
        callee: { type: "Identifier", name: "execSync" },
        arguments: [{
          type: "BinaryExpression", operator: "+",
          left: { type: "Literal", value: "rm -rf " },
          right: { type: "Identifier", name: "userInput" }
        }]
      }
    }]
  };
}

test("without a language plugin, SAST cannot read the DSL (no findings)", () => {
  resetPlugins("language");
  assert.deepEqual(scanSastFile("playbook.dsl", DSL), []);
});

test("WITH a registered .dsl language plugin, SAST detects the injection (plugin extends analysis)", () => {
  resetPlugins("language");
  let parsedByPlugin = false;
  registerPlugin({
    kind: "language",
    id: "shell-dsl",
    extensions: ["dsl"],
    parse: (_source) => { parsedByPlugin = true; return compileDsl(); }
  });
  try {
    const findings = scanSastFile("playbook.dsl", DSL);
    assert.equal(parsedByPlugin, true, "the plugin's parser must be the one invoked for .dsl");
    assert.ok(findings.some((f) => f.severity === "high"), `expected a high finding via the plugin AST, got ${JSON.stringify(findings)}`);
  } finally {
    resetPlugins("language");
  }
});

test("built-in JS/TS handling is unchanged by routing (no regression)", () => {
  resetPlugins("language");
  assert.ok(scanSastFile("x.mjs", "export function h(req){ execSync(req.body.cmd); }").some((f) => f.severity === "high"));
  assert.deepEqual(scanSastFile("safe.mjs", "export const x = path.join(base, name);"), []);
});

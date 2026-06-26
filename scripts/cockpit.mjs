import { fileURLToPath } from "node:url";
import { gatherCockpitSnapshot, renderCockpit } from "../packages/cockpit/cockpit.mjs";

// Terminal cockpit: render the kernel's live proof/evidence status. `--watch`
// re-renders every few seconds; `--no-color` disables ANSI; `--json` prints the
// raw snapshot.
export function runCockpit(root = process.cwd(), options = {}) {
  const snapshot = gatherCockpitSnapshot({ root });
  return options.json ? JSON.stringify(snapshot, null, 2) : renderCockpit(snapshot, { color: options.color !== false });
}

/* node:coverage ignore next 16 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = { json: args.includes("--json"), color: !args.includes("--no-color") };
  const watch = args.includes("--watch");
  const draw = () => {
    if (!options.json) process.stdout.write("\x1b[2J\x1b[H");
    process.stdout.write(`${runCockpit(process.cwd(), options)}\n`);
  };
  draw();
  if (watch) {
    const intervalArg = args.find((a) => a.startsWith("--interval="));
    const interval = Math.max(1000, Number(intervalArg?.split("=")[1] || 3000));
    setInterval(draw, interval);
  }
}

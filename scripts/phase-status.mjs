import fs from "node:fs";
import path from "node:path";

const phasesPath = path.join(process.cwd(), "catalog", "phases.json");
const { phases } = JSON.parse(fs.readFileSync(phasesPath, "utf8"));

for (const phase of phases) {
  console.log(`${phase.id}. ${phase.name} - ${phase.status}`);
}

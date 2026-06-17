import fs from "node:fs";
import path from "node:path";
import { dashboardSnapshot, renderDashboardHtml } from "../server.mjs";

const root = process.cwd();
const outDir = path.join(root, "apps/dashboard/dist");
const outFile = path.join(outDir, "index.html");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, renderDashboardHtml(dashboardSnapshot({ root })));

console.log(outFile);

#!/usr/bin/env node
import { validateSdlcProfiles } from "../project-detector.mjs";

const report = validateSdlcProfiles();
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exit(1);


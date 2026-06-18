#!/usr/bin/env node
import { proveProfiles } from "../project-detector.mjs";

const report = proveProfiles({ root: process.cwd() });
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exit(1);


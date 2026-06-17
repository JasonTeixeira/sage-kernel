import { migrateKernelDb } from "../migrations.mjs";

const result = await migrateKernelDb({ root: process.cwd() });
console.log(JSON.stringify(result, null, 2));

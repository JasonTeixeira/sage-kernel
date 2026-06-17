import { listAdapters } from "../adapters.mjs";

console.log(JSON.stringify(listAdapters({ root: process.cwd() }), null, 2));

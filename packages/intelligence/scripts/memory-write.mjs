import fs from "node:fs";

import { createMemoryStore } from "../memory-store.mjs";

const input = process.argv[2] ? JSON.parse(process.argv[2]) : JSON.parse(fs.readFileSync(0, "utf8"));
const record = createMemoryStore().write(input);
console.log(JSON.stringify(record, null, 2));


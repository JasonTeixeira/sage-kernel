import { createMemoryStore } from "../memory-store.mjs";

console.log(JSON.stringify(createMemoryStore().audit(), null, 2));


import { listRunbooks } from "../runbooks.mjs";

console.log(JSON.stringify({ runbooks: listRunbooks({ root: process.cwd() }) }, null, 2));

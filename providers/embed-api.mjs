#!/usr/bin/env node
// SAGE_EMBEDDING_COMMAND adapter — embeds stdin text via an OpenAI-compatible
// embedding API. Env: SAGE_EMBEDDING_API_URL (required), SAGE_EMBEDDING_API_KEY
// (optional), SAGE_EMBEDDING_MODEL (optional). Prints the vector as JSON.
let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

const url = process.env.SAGE_EMBEDDING_API_URL;
if (!url) {
  process.stderr.write("Set SAGE_EMBEDDING_API_URL to use the embedding adapter.");
  process.exit(1);
}
const headers = { "content-type": "application/json" };
if (process.env.SAGE_EMBEDDING_API_KEY) headers.authorization = `Bearer ${process.env.SAGE_EMBEDDING_API_KEY}`;

try {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: process.env.SAGE_EMBEDDING_MODEL || "text-embedding-3-small", input })
  });
  const json = await response.json();
  const vector = json.data?.[0]?.embedding || json.embedding || json;
  if (!Array.isArray(vector)) {
    process.stderr.write("Embedding API returned no vector.");
    process.exit(1);
  }
  console.log(JSON.stringify(vector));
} catch (error) {
  process.stderr.write(String(error?.message || error));
  process.exit(1);
}

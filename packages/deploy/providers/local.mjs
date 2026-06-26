// Local deploy provider (P31) — a REAL provider used to prove the pipeline end to
// end without a cloud account. Each "deploy" boots a real local HTTP server that
// serves the deployed version; an unhealthy version returns 500 on /health so a
// verify genuinely fails and triggers rollback. Rollback re-deploys the previous
// version (a real, observable state change over HTTP).

import http from "node:http";

export function createLocalProvider() {
  let server = null;
  let current = null;

  async function listen(version) {
    await stop();
    server = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(version?.healthy === false ? 500 : 200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: version?.healthy === false ? "unhealthy" : "ok", version: version?.id }));
        return;
      }
      if (req.url === "/version") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ version: version?.id }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    current = version;
    return { version: version?.id, baseUrl: `http://127.0.0.1:${server.address().port}`, healthy: version?.healthy !== false };
  }

  async function stop() {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }
  }

  return {
    name: "local",
    deploy: (version) => listen(version),
    rollback: (_failed, previous) => listen(previous),
    current: () => current,
    shutdown: stop
  };
}

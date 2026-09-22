import { gateway } from "../gateway.mjs";
// Cloudflare's container port is reachable only through the authenticated Worker.
// The generic host entry point retains its loopback-only listener.
const server = gateway({ token: process.env.EGRESS_PROXY_TOKEN });
server.listen(8080, "0.0.0.0");
process.on("SIGTERM", () => {
  server.close();
  setTimeout(() => {
    server.closeAllConnections();
    process.exit(0);
  }, 12000).unref();
});

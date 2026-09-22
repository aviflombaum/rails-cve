import { Container } from "@cloudflare/containers";
import { admit } from "./admission.mjs";
interface GatewayEnv {
  GATEWAY: DurableObjectNamespace<EgressContainer>;
  EGRESS_PROXY_TOKEN: string;
}
export class EgressContainer extends Container<GatewayEnv> {
  defaultPort = 8080;
  sleepAfter = "60s";
  enableInternet = true;
  // Preserve direct pinned-IP TLS; never re-fetch intercepted receiver URLs in a Worker.
  interceptHttps = false;
  envVars = { EGRESS_PROXY_TOKEN: this.env.EGRESS_PROXY_TOKEN, NODE_ENV: "production" };
  override onError() {
    /* Do not log request, destination or environment details. */
  }
}
export default {
  fetch(request: Request, env: GatewayEnv) {
    return admit(request, env.EGRESS_PROXY_TOKEN, (safeRequest) =>
      env.GATEWAY.getByName("gateway").fetch(safeRequest),
    );
  },
} satisfies ExportedHandler<GatewayEnv>;

import fs from "node:fs/promises";

const exchangeUrl =
  process.env.NL_OBSERVATORY_EXCHANGE_URL ||
  "https://neurolife.cloud/api/observatory_oidc_exchange.php";

const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL || "";
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || "";

if (!requestUrl || !requestToken) {
  throw new Error("GitHub OIDC environment is unavailable. Workflow needs permissions: id-token: write");
}

const audience = "neurolife-observatory";
const oidcResponse = await fetch(
  `${requestUrl}${requestUrl.includes("?") ? "&" : "?"}audience=${encodeURIComponent(audience)}`,
  {
    headers: {
      authorization: `Bearer ${requestToken}`,
      accept: "application/json"
    }
  }
);

if (!oidcResponse.ok) {
  throw new Error(`GitHub OIDC token request failed: HTTP ${oidcResponse.status}`);
}

const oidc = await oidcResponse.json();
if (!oidc?.value) throw new Error("GitHub OIDC response did not contain a token");

const exchange = await fetch(exchangeUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "accept": "application/json",
    "user-agent": "NeuroLife-GitHub-Observatory/24.1"
  },
  body: JSON.stringify({
    schema: "NL_OBSERVATORY_OIDC_EXCHANGE_REQUEST_1",
    oidc_token: oidc.value,
    requested_scope: "OBSERVATORY_READ_ONLY",
    requested_ttl_seconds: 900
  })
});

const bodyText = await exchange.text();
let body;
try { body = JSON.parse(bodyText); } catch {
  throw new Error(`NeuroLife OIDC exchange returned non-JSON HTTP ${exchange.status}`);
}

if (!exchange.ok || body?.ok !== true || !body?.connect_url) {
  const safeError = String(body?.error || body?.detail || `HTTP ${exchange.status}`).slice(0, 400);
  throw new Error(`NeuroLife OIDC exchange failed: ${safeError}`);
}

const connectUrl = String(body.connect_url);
if (!/^https:\/\/neurolife\.cloud\/connect\.php\/NLB-[A-Za-z0-9_-]+$/.test(connectUrl)) {
  throw new Error("NeuroLife OIDC exchange returned an invalid connect URL");
}

const expiresAt = String(body.expires_at || "");
const githubEnv = process.env.GITHUB_ENV;
if (!githubEnv) throw new Error("GITHUB_ENV missing");

console.log("::add-mask::" + connectUrl);
console.log(`NEUROLIFE_SESSION_ISSUED expires_at=${expiresAt || "unknown"} scope=OBSERVATORY_READ_ONLY`);

await fs.appendFile(githubEnv, `NL_CONNECT_URL=${connectUrl}\n`, "utf8");
await fs.appendFile(githubEnv, `NL_CONNECT_URL_EXPIRES_AT=${expiresAt}\n`, "utf8");

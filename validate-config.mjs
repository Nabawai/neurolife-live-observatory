import fs from "node:fs/promises";

const routeCfg = JSON.parse(await fs.readFile("config/routes.json", "utf8"));
const vpCfg = JSON.parse(await fs.readFile("config/viewports.json", "utf8"));
const privacyCfg = JSON.parse(await fs.readFile("config/privacy.json", "utf8"));

if (!Array.isArray(routeCfg.routes) || !routeCfg.routes.length) throw new Error("routes.json has no routes");
if (!Array.isArray(vpCfg.viewports) || !vpCfg.viewports.length) throw new Error("viewports.json has no viewports");
if (!Array.isArray(privacyCfg.redact_selectors)) throw new Error("privacy.json missing redact_selectors");

for (const r of routeCfg.routes) {
  if (!r.id || !r.kind) throw new Error("route missing id/kind");
  if (r.kind === "public" && !r.url) throw new Error(`public route ${r.id} missing url`);
  if (r.kind === "control" && !r.suffix) throw new Error(`control route ${r.id} missing suffix`);
}

console.log("CONFIG_OK");

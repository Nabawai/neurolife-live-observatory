import fs from "node:fs/promises";
import path from "node:path";
import { redactObject, redactString } from "./redact.mjs";

async function tryJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

export async function captureControlPlane({ connectUrl, entries, outputDir }) {
  const results = [];
  if (!connectUrl) {
    return { available: false, reason: "NL_CONNECT_URL_NOT_CONFIGURED", results };
  }

  await fs.mkdir(outputDir, { recursive: true });

  for (const entry of entries) {
    const url = `${connectUrl}${entry.suffix || ""}`;
    const started = Date.now();
    let status = 0;
    let ok = false;
    let bodyOut = null;
    let error = "";

    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "accept": "application/json,text/plain;q=0.9,text/html;q=0.8",
          "user-agent": "NeuroLife-GitHub-Observatory/24.0"
        }
      });
      status = response.status;
      const text = await response.text();
      const parsed = await tryJson(text);
      bodyOut = parsed ? redactObject(parsed) : redactString(text.slice(0, 12000));
      ok = response.ok;
    } catch (e) {
      error = redactString(e?.message || String(e));
    }

    const result = {
      id: entry.id,
      ok,
      status,
      duration_ms: Date.now() - started,
      error
    };
    results.push(result);

    await fs.writeFile(
      path.join(outputDir, `${entry.id}.json`),
      JSON.stringify({ ...result, body: bodyOut }, null, 2)
    );
  }

  return {
    available: true,
    ok: results.every(r => r.ok),
    results
  };
}

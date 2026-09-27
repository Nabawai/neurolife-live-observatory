import fs from "node:fs/promises";
import path from "node:path";
import { redactString, safeUrl } from "./redact.mjs";

const ROLE_NAMES = ["OWNER", "DOCTOR", "SECRETARY", "ACCOUNTANT", "PATIENT"];

function decodeState(b64) {
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

export async function captureOptionalRoleSessions({ browser, outputDir, viewports }) {
  const results = [];
  await fs.mkdir(outputDir, { recursive: true });

  for (const role of ROLE_NAMES) {
    const stateB64 = process.env[`NL_${role}_STORAGE_STATE_B64`] || "";
    const entryUrl = process.env[`NL_${role}_ENTRY_URL`] || "";

    if (!stateB64 || !entryUrl) {
      results.push({ role, state: "SKIPPED", reason: "ROLE_SESSION_NOT_CONFIGURED" });
      continue;
    }

    let storageState;
    try {
      storageState = decodeState(stateB64);
    } catch {
      results.push({ role, state: "FAIL", reason: "INVALID_STORAGE_STATE" });
      continue;
    }

    for (const vp of viewports || []) {
      const context = await browser.newContext({
        storageState,
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.deviceScaleFactor || 1
      });
      const page = await context.newPage();

      const consoleErrors = [];
      const pageErrors = [];
      const networkFailures = [];

      page.on("console", msg => {
        if (msg.type() === "error") consoleErrors.push(redactString(msg.text()).slice(0, 700));
      });
      page.on("pageerror", err => pageErrors.push(redactString(err.message).slice(0, 700)));
      page.on("requestfailed", req => networkFailures.push({
        method: req.method(),
        url: safeUrl(req.url()),
        error: redactString(req.failure()?.errorText || "")
      }));

      let httpStatus = 0;
      let state = "FAIL";
      let reason = "";
      const started = Date.now();

      try {
        const response = await page.goto(entryUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000
        });
        httpStatus = response?.status() || 0;
        try { await page.waitForLoadState("networkidle", { timeout: 5000 }); } catch {}

        await page.addStyleTag({
          content: `
            input,textarea,[data-private],[data-sensitive],
            .patient-name,.patient-phone,.patient-email,.patient-id,
            .medical-record-number,.national-id {
              color: transparent !important;
              text-shadow: 0 0 10px rgba(0,0,0,.6) !important;
              caret-color: transparent !important;
            }
          `
        }).catch(() => {});

        await page.screenshot({
          path: path.join(outputDir, `${role.toLowerCase()}__${vp.id}.png`),
          fullPage: true,
          animations: "disabled"
        });

        state = httpStatus > 0 && httpStatus < 400 && pageErrors.length === 0 ? "PASS" : "FAIL";
      } catch (e) {
        reason = redactString(e?.message || String(e)).slice(0, 700);
      }

      results.push({
        role,
        viewport: vp.id,
        state,
        reason,
        http_status: httpStatus,
        duration_ms: Date.now() - started,
        console_errors: consoleErrors.slice(0, 20),
        page_errors: pageErrors.slice(0, 20),
        network_failures: networkFailures.slice(0, 30)
      });

      await context.close();
    }
  }

  return {
    configured_roles: ROLE_NAMES.filter(r =>
      process.env[`NL_${r}_STORAGE_STATE_B64`] && process.env[`NL_${r}_ENTRY_URL`]
    ),
    results
  };
}

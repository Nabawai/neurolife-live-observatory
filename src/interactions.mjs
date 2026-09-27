import fs from "node:fs/promises";
import path from "node:path";
import { redactString, safeUrl } from "./redact.mjs";

export async function runSafeInteractions({ browser, connectUrl, interactions, outputDir }) {
  const results = [];
  if (!connectUrl) return { available: false, reason: "NL_CONNECT_URL_NOT_CONFIGURED", results };

  await fs.mkdir(outputDir, { recursive: true });

  for (const item of interactions || []) {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();

    const errors = [];
    const failed = [];
    page.on("pageerror", e => errors.push(redactString(e.message).slice(0, 800)));
    page.on("requestfailed", r => failed.push({
      method: r.method(),
      url: safeUrl(r.url()),
      error: redactString(r.failure()?.errorText || "")
    }));

    let state = "FAIL";
    let reason = "";
    let finalPath = "";
    const started = Date.now();

    try {
      await page.goto(`${connectUrl}${item.start_suffix}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });
      const loc = page.locator(item.selector).first();
      if (await loc.count() < 1) throw new Error("selector not found");
      if (!(await loc.isVisible())) throw new Error("selector not visible");

      await Promise.all([
        page.waitForLoadState("domcontentloaded").catch(() => {}),
        loc.click({ timeout: 10000 })
      ]);

      const u = new URL(page.url());
      finalPath = `${u.pathname}${u.search.replace(/NLB-[A-Za-z0-9_-]+/g, "NLB-[REDACTED]")}`;
      if (!page.url().includes(item.expect_url_contains)) {
        throw new Error(`unexpected destination`);
      }

      state = errors.length === 0 ? "PASS" : "FAIL";
      if (errors.length) reason = "PAGE_ERROR";
    } catch (e) {
      reason = redactString(e?.message || String(e)).slice(0, 600);
    }

    const shot = path.join(outputDir, `${item.id}.png`);
    await page.screenshot({ path: shot, fullPage: true, animations: "disabled" }).catch(() => {});

    results.push({
      id: item.id,
      state,
      reason,
      duration_ms: Date.now() - started,
      final_path: finalPath,
      page_errors: errors,
      request_failures: failed.slice(0, 20)
    });

    await context.close();
  }

  return {
    available: true,
    ok: results.every(r => r.state === "PASS"),
    results
  };
}

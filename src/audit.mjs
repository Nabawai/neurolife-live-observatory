import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { safeUrl, redactString, redactObject } from "./redact.mjs";
import { captureControlPlane } from "./control-plane.mjs";
import { compareWithBaseline } from "./visual-diff.mjs";
import { runSafeInteractions } from "./interactions.mjs";
import { captureOptionalRoleSessions } from "./roles.mjs";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "observatory-output");
const SCREEN = path.join(OUTPUT, "screenshots");
const DOM = path.join(OUTPUT, "dom");
const DIFF = path.join(OUTPUT, "diffs");
const CONTROL = path.join(OUTPUT, "control");
const BASELINES = path.join(ROOT, "baselines");

const routesCfg = JSON.parse(await fs.readFile(path.join(ROOT, "config/routes.json"), "utf8"));
const viewCfg = JSON.parse(await fs.readFile(path.join(ROOT, "config/viewports.json"), "utf8"));
const privacyCfg = JSON.parse(await fs.readFile(path.join(ROOT, "config/privacy.json"), "utf8"));
const interactionCfg = JSON.parse(await fs.readFile(path.join(ROOT, "config/interactions.json"), "utf8"));

const connectUrl = (process.env.NL_CONNECT_URL || "").replace(/[?#].*$/, "");
const visualThreshold = Number(process.env.NL_VISUAL_DIFF_THRESHOLD || "0.08");

await fs.rm(OUTPUT, { recursive: true, force: true });
for (const d of [OUTPUT, SCREEN, DOM, DIFF, CONTROL]) await fs.mkdir(d, { recursive: true });

const control = await captureControlPlane({
  connectUrl,
  entries: routesCfg.control_json || [],
  outputDir: CONTROL
});

const browser = await chromium.launch({ headless: true });
const results = [];

function routeUrl(route) {
  if (route.kind === "public") return route.url;
  if (route.kind === "control") {
    if (!connectUrl) return null;
    return `${connectUrl}${route.suffix || ""}`;
  }
  return route.url || null;
}

for (const route of routesCfg.routes || []) {
  for (const vp of viewCfg.viewports || []) {
    const target = routeUrl(route);
    if (!target) {
      results.push({
        route_id: route.id,
        viewport: vp.id,
        critical: !!route.critical,
        state: "SKIPPED",
        reason: "MISSING_REQUIRED_SECRET"
      });
      continue;
    }

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor || 1,
      ignoreHTTPSErrors: false
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const requestFailures = [];
    const badResponses = [];

    page.on("console", msg => {
      if (msg.type() === "error") consoleErrors.push(redactString(msg.text()).slice(0, 1000));
    });
    page.on("pageerror", err => pageErrors.push(redactString(err.message).slice(0, 1000)));
    page.on("requestfailed", req => {
      requestFailures.push({
        method: req.method(),
        url: safeUrl(req.url()),
        error: redactString(req.failure()?.errorText || "")
      });
    });
    page.on("response", res => {
      if (res.status() >= 400) {
        badResponses.push({
          status: res.status(),
          method: res.request().method(),
          url: safeUrl(res.url())
        });
      }
    });

    const started = Date.now();
    let httpStatus = 0;
    let navError = "";
    let title = "";
    let screenshotPath = "";
    let domPath = "";
    let visual = { state: "NOT_RUN", ratio: null };

    try {
      const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
      httpStatus = response?.status() || 0;
      try { await page.waitForLoadState("networkidle", { timeout: 6000 }); } catch {}
      title = redactString(await page.title());

      await page.addStyleTag({
        content: `
          ${privacyCfg.redact_selectors.join(",")} {
            color: transparent !important;
            text-shadow: 0 0 10px rgba(0,0,0,.55) !important;
            caret-color: transparent !important;
          }
        `
      }).catch(() => {});

      const shotName = `${route.id}__${vp.id}.png`;
      screenshotPath = path.join(SCREEN, shotName);
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });

      const dom = await page.evaluate(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 300);
        const nodes = [...document.querySelectorAll(
          "a,button,input,select,textarea,[role],[aria-label],[data-testid]"
        )].slice(0, 2000);
        return nodes.map((el, i) => {
          const r = el.getBoundingClientRect();
          let href = "";
          try {
            if (el.href) {
              const u = new URL(el.href, location.href);
              href = u.origin + u.pathname;
            }
          } catch {}
          return {
            i,
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role") || "",
            aria: clean(el.getAttribute("aria-label")),
            text: el.matches("input,textarea") ? "[INPUT]" : clean(el.innerText || el.textContent),
            href,
            visible: visible(el),
            disabled: !!el.disabled,
            rect: {
              x: Math.round(r.x), y: Math.round(r.y),
              width: Math.round(r.width), height: Math.round(r.height)
            }
          };
        });
      });

      domPath = path.join(DOM, `${route.id}__${vp.id}.json`);
      await fs.writeFile(domPath, JSON.stringify(redactObject(dom), null, 2));

      const baselinePath = path.join(BASELINES, shotName);
      const diffPath = path.join(DIFF, shotName);
      visual = await compareWithBaseline(screenshotPath, baselinePath, diffPath);
    } catch (e) {
      navError = redactString(e?.message || String(e)).slice(0, 1600);
    }

    const viewportOverflow = await page.evaluate(() => ({
      scroll_width: document.documentElement.scrollWidth,
      client_width: document.documentElement.clientWidth,
      horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
    })).catch(() => null);

    const functionalOk =
      !navError &&
      httpStatus > 0 &&
      httpStatus < 400 &&
      pageErrors.length === 0;

    const visualRegression =
      visual?.state === "CHANGED" &&
      typeof visual.ratio === "number" &&
      visual.ratio > visualThreshold;

    results.push({
      route_id: route.id,
      label: route.label,
      viewport: vp.id,
      critical: !!route.critical,
      state: functionalOk && !visualRegression ? "PASS" : "FAIL",
      http_status: httpStatus,
      duration_ms: Date.now() - started,
      title,
      navigation_error: navError,
      console_errors: consoleErrors.slice(0, 30),
      page_errors: pageErrors.slice(0, 30),
      request_failures: requestFailures.slice(0, 50),
      bad_responses: badResponses.slice(0, 50),
      viewport: {
        width: vp.width,
        height: vp.height,
        ...viewportOverflow
      },
      visual
    });

    await context.close();
  }
}

const interactions = await runSafeInteractions({
  browser,
  connectUrl,
  interactions: interactionCfg.interactions || [],
  outputDir: path.join(OUTPUT, "interactions")
});

const roleSessions = await captureOptionalRoleSessions({
  browser,
  outputDir: path.join(OUTPUT, "roles"),
  viewports: viewCfg.viewports || []
});

await browser.close();

const criticalFailures = results.filter(r => r.critical && r.state === "FAIL");
const allFailures = results.filter(r => r.state === "FAIL");
const skipped = results.filter(r => r.state === "SKIPPED");

let release = "";
try {
  const truth = JSON.parse(await fs.readFile(path.join(CONTROL, "native-current-truth.json"), "utf8"));
  release =
    truth?.body?.release ||
    truth?.body?.current_release?.release ||
    truth?.body?.result?.release ||
    "";
} catch {}

const report = {
  schema: "NL_GITHUB_LIVE_OBSERVATORY_REPORT_1",
  generated_at: new Date().toISOString(),
  observer_version: "24.0.0",
  source: "GITHUB_ACTIONS",
  release,
  overall: criticalFailures.length === 0 ? "PASS" : "FAIL",
  control_plane: control,
  interactions,
  role_sessions: roleSessions,
  counts: {
    checks: results.length,
    passed: results.filter(r => r.state === "PASS").length,
    failed: allFailures.length,
    critical_failed: criticalFailures.length,
    skipped: skipped.length
  },
  checks: results
};

await fs.writeFile(path.join(OUTPUT, "report.json"), JSON.stringify(report, null, 2));

const md = [];
md.push("# NeuroLife Live Observatory");
md.push("");
md.push(`- Generated: \`${report.generated_at}\``);
md.push(`- Release: \`${release || "unknown"}\``);
md.push(`- Overall: **${report.overall}**`);
md.push(`- Checks: ${report.counts.checks}`);
md.push(`- Failed: ${report.counts.failed}`);
md.push(`- Critical failed: ${report.counts.critical_failed}`);
md.push(`- Skipped: ${report.counts.skipped}`);
md.push(`- Safe interactions: ${interactions.available ? (interactions.ok ? "PASS" : "FAIL") : "SKIPPED"}`);
md.push(`- Configured role sessions: ${(roleSessions.configured_roles || []).join(", ") || "none"}`);
md.push("");
md.push("| Route | Viewport | HTTP | State | JS errors | Network failures | Visual | Overflow |");
md.push("|---|---:|---:|---|---:|---:|---|---:|");
for (const r of results) {
  md.push(`| ${r.route_id} | ${r.viewport} | ${r.http_status || "-"} | ${r.state} | ${(r.page_errors?.length || 0) + (r.console_errors?.length || 0)} | ${(r.request_failures?.length || 0) + (r.bad_responses?.length || 0)} | ${r.visual?.state || "-"} | ${r.viewport?.horizontal_overflow_px ?? "-"} |`);
}
await fs.writeFile(path.join(OUTPUT, "summary.md"), md.join("\n") + "\n");

const safe = {
  schema: "NEUROLIFE_PUBLIC_LIVE_STATUS_1",
  generated_at: report.generated_at,
  source: "NEUROLIFE_GITHUB_LIVE_OBSERVATORY",
  release: release || null,
  overall: report.overall,
  counts: report.counts,
  planes: {
    MAIN: "OBSERVED",
    BOT: "DISCOVERY_CONFIGURED",
    NODE_CLOUD: "DISCOVERY_CONFIGURED"
  },
  routes: results.map(r => ({
    id: r.route_id,
    viewport: r.viewport,
    state: r.state,
    http_status: r.http_status || null,
    horizontal_overflow_px: r.viewport?.horizontal_overflow_px ?? null,
    visual_state: r.visual?.state || null
  }))
};
await fs.writeFile(path.join(OUTPUT, "public-live-status.json"), JSON.stringify(safe, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
}

if (criticalFailures.length > 0) process.exitCode = 2;

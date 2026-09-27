import fs from "node:fs/promises";

const token = process.env.PUBLIC_DISCOVERY_TOKEN || "";
const repo = process.env.PUBLIC_DISCOVERY_REPO || "Nabawai/Neurolife-ai-updat-2";
const branch = process.env.PUBLIC_DISCOVERY_BRANCH || "main";
const path = process.env.PUBLIC_DISCOVERY_PATH || "LIVE_STATUS.json";

if (!token) {
  console.log("PUBLIC_STATUS_SKIP: PUBLIC_DISCOVERY_TOKEN not configured");
  process.exit(0);
}

const content = await fs.readFile("observatory-output/public-live-status.json", "utf8");
const encoded = Buffer.from(content, "utf8").toString("base64");
const api = `https://api.github.com/repos/${repo}/contents/${path}`;

const headers = {
  "accept": "application/vnd.github+json",
  "authorization": `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "NeuroLife-GitHub-Observatory/24.0"
};

let sha;
const existing = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
if (existing.ok) {
  const data = await existing.json();
  sha = data.sha;
} else if (existing.status !== 404) {
  throw new Error(`Cannot inspect public status target: HTTP ${existing.status}`);
}

const body = {
  message: "chore(observatory): publish sanitized NeuroLife live status",
  content: encoded,
  branch,
  ...(sha ? { sha } : {})
};

const response = await fetch(api, {
  method: "PUT",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify(body)
});

if (!response.ok) {
  const txt = await response.text();
  throw new Error(`Public status publish failed: HTTP ${response.status} ${txt.slice(0, 500)}`);
}

console.log("PUBLIC_STATUS_PUBLISHED");

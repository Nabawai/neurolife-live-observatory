import fs from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function compareWithBaseline(currentPath, baselinePath, diffPath) {
  if (!(await exists(baselinePath))) {
    return { state: "NO_BASELINE", changed_pixels: null, ratio: null };
  }

  const [aBuf, bBuf] = await Promise.all([
    fs.readFile(currentPath),
    fs.readFile(baselinePath)
  ]);
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);

  if (a.width !== b.width || a.height !== b.height) {
    return {
      state: "DIMENSION_CHANGED",
      current: { width: a.width, height: a.height },
      baseline: { width: b.width, height: b.height },
      changed_pixels: null,
      ratio: 1
    };
  }

  const diff = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(
    a.data, b.data, diff.data, a.width, a.height,
    { threshold: 0.12, includeAA: false }
  );

  await fs.mkdir(path.dirname(diffPath), { recursive: true });
  await fs.writeFile(diffPath, PNG.sync.write(diff));

  const total = a.width * a.height;
  return {
    state: changed === 0 ? "MATCH" : "CHANGED",
    changed_pixels: changed,
    ratio: total ? changed / total : 0
  };
}

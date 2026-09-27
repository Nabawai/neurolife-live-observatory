import fs from "node:fs/promises";
import path from "node:path";

const source = path.join(process.cwd(), "observatory-output", "screenshots");
const target = path.join(process.cwd(), "baselines");

await fs.mkdir(target, { recursive: true });
const names = await fs.readdir(source);
let count = 0;
for (const name of names) {
  if (!name.endsWith(".png")) continue;
  await fs.copyFile(path.join(source, name), path.join(target, name));
  count++;
}
console.log(`BASELINE_UPDATED count=${count}`);

import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const vaultPath = process.argv[2] ? resolve(process.argv[2]) : "";
const apply = process.argv.includes("--apply");

if (!vaultPath) {
  console.error("Usage: node scripts/clean-legacy-obsidian-notes.mjs <vault-path> [--apply]");
  process.exit(1);
}

const experiencesPath = join(vaultPath, "02_Experiences");
const candidates = readdirSync(experiencesPath, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
  .map((entry) => {
    const fullPath = join(experiencesPath, entry.name);
    const content = readFileSync(fullPath, "utf8");
    const hasAutoBlock = content.includes("<!-- vibe:auto -->");
    const hasHumanZone = /##\s+Curadur(?:ía|ia|Ã­a) humana/i.test(content);
    const hasFrontmatter = content.trimStart().startsWith("---");
    return { name: entry.name, fullPath, legacy: !hasAutoBlock && !hasHumanZone && !hasFrontmatter };
  })
  .filter((entry) => entry.legacy);

if (!candidates.length) {
  console.log("No legacy Obsidian experience notes found.");
  process.exit(0);
}

console.log(`${candidates.length} legacy Obsidian experience note(s) found:`);
candidates.forEach((entry) => console.log(`- ${entry.name}`));

if (!apply) {
  console.log("\nDry run only. Add --apply to delete these files.");
  process.exit(0);
}

candidates.forEach((entry) => unlinkSync(entry.fullPath));
console.log(`Deleted ${candidates.length} legacy Obsidian experience note(s).`);

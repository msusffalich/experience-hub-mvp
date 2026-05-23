import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const isProductionBuild = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.CI);
const requirementsPath = "requirements.txt";

if (!existsSync(requirementsPath)) {
  process.exit(0);
}

const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
let pythonCommand = "";
let pythonArgs = [];

for (const candidate of candidates) {
  const args = candidate === "py" ? ["-3", "--version"] : ["--version"];
  const result = spawnSync(candidate, args, { stdio: "ignore", windowsHide: true });
  if (result.status === 0) {
    pythonCommand = candidate;
    pythonArgs = candidate === "py" ? ["-3"] : [];
    break;
  }
}

if (!pythonCommand) {
  const message = "Python is required to install ReportLab for production PDF exports.";
  if (isProductionBuild) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`${message} Skipping local optional install.`);
  process.exit(0);
}

const install = spawnSync(
  pythonCommand,
  [...pythonArgs, "-m", "pip", "install", "--target", "./.python", "-r", requirementsPath],
  { stdio: "inherit", windowsHide: true },
);

if (install.status !== 0) {
  const message = "Could not install Python PDF dependencies from requirements.txt.";
  if (isProductionBuild) {
    console.error(message);
    process.exit(install.status || 1);
  }
  console.warn(`${message} PDF export may use the fallback renderer locally.`);
}

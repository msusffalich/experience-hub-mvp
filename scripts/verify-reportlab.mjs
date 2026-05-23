import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

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
  console.error("Python is not available for ReportLab PDF verification.");
  process.exit(1);
}

const pythonPath = [path.join(process.cwd(), ".python"), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
const result = spawnSync(
  pythonCommand,
  [...pythonArgs, "-c", "import reportlab; print('ReportLab ready', reportlab.Version)"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONPATH: pythonPath,
    },
  },
);

if (result.status !== 0) {
  if (!existsSync(".python")) {
    console.error("ReportLab verification failed and .python dependency folder is missing.");
  }
  process.exit(result.status || 1);
}

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ApiError } from "./errors.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPTS = Object.freeze({
  report: "report_pdf_reportlab.py",
  insights: "insights_pdf_reportlab.py",
  publication: "publication_pdf_reportlab.py",
  manual: "manual_pdf_reportlab.py",
});

export function createOutputService({ config }) {
  async function pdf(type, payload) {
    const script = SCRIPTS[type];
    if (!script) throw new ApiError(400, "output_type_invalid");
    const input = type === "report" ? (payload.report || payload) : payload;
    const buffer = await runPython(config.pythonCommand, path.join(ROOT, "scripts", script), input);
    if (buffer.length < 5 || buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw new ApiError(502, "pdf_output_invalid");
    }
    return buffer;
  }

  return { pdf };
}

function runPython(command, script, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [script], {
      cwd: ROOT,
      windowsHide: true,
      // Sin PYTHONPATH no se encuentra reportlab: las dependencias se instalan
      // con `pip --target ./.python` (ver scripts/install-python-deps.mjs), no
      // en el site-packages del sistema.
      env: {
        ...process.env,
        PYTHONPATH: [path.join(ROOT, ".python"), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = [];
    const errors = [];
    let outputBytes = 0;
    const maxOutputBytes = 80 * 1024 * 1024;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new ApiError(504, "pdf_timeout"));
    }, 90_000);
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill();
        reject(new ApiError(502, "pdf_output_too_large"));
        return;
      }
      output.push(chunk);
    });
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new ApiError(503, "pdf_runtime_unavailable", error.message));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new ApiError(
          502,
          "pdf_generation_failed",
          "No se pudo generar el PDF.",
          Buffer.concat(errors).toString("utf8").slice(0, 1200),
        ));
        return;
      }
      resolve(Buffer.concat(output));
    });
    // Sin listener, un EPIPE sobre el stdin destruido tumba el proceso Node en
    // vez de devolver un error controlado.
    child.stdin.on("error", (error) => {
      clearTimeout(timeout);
      reject(new ApiError(503, "pdf_runtime_unavailable", error?.message || "stdin_failed"));
    });
    child.stdin.end(JSON.stringify(payload || {}));
  });
}

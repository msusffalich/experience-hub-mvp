const { spawn } = require("node:child_process");
const { openSync } = require("node:fs");
const path = require("node:path");

const cwd = __dirname;
const out = openSync(path.join(cwd, "server-live-current.log"), "a");
const err = openSync(path.join(cwd, "server-live-current.err.log"), "a");
const child = spawn(process.execPath, ["server.js"], {
  cwd,
  detached: true,
  stdio: ["ignore", out, err],
  windowsHide: true,
});
child.unref();
console.log(child.pid);

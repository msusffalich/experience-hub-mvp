import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "vibeapp");
const avdName = process.env.VIBE_ANDROID_AVD || "Vibeapp_Pilot_API35";
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join("C:", "Users", "msusf", "Documents", "Codex", "Android", "sdk");
const javaHome = process.env.JAVA_HOME || path.join("C:", "Users", "msusf", "Documents", "Codex", "Java", "jdk-21");
const flutterBin = process.env.FLUTTER_BIN || path.join("C:", "Users", "msusf", "Documents", "Codex", "flutter-sdk", "bin", process.platform === "win32" ? "flutter.bat" : "flutter");
const adb = path.join(androidHome, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
const emulator = path.join(androidHome, "emulator", process.platform === "win32" ? "emulator.exe" : "emulator");
const sourceAvdHome = process.env.VIBE_SOURCE_AVD_HOME || path.join("C:", "Users", "CodexSandboxOffline", ".android", "avd");
const localAvdHome = path.join(root, ".android", "avd");
const localAvdDir = path.join(localAvdHome, `${avdName}.avd`);
const localAvdIni = path.join(localAvdHome, `${avdName}.ini`);
const evidencePath = path.join(root, "data", "android-emulator-validation.json");

const env = {
  ...process.env,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  ANDROID_AVD_HOME: localAvdHome,
  JAVA_HOME: javaHome,
  APPDATA: path.join(root, ".tool-home", "appdata"),
  LOCALAPPDATA: path.join(root, ".tool-home", "localappdata"),
  FLUTTER_SUPPRESS_ANALYTICS: "true",
  DART_SUPPRESS_ANALYTICS: "true",
  Path: [
    path.join(javaHome, "bin"),
    path.join(androidHome, "platform-tools"),
    path.join(androidHome, "emulator"),
    process.env.Path || process.env.PATH || "",
  ].join(path.delimiter),
};
env.PATH = env.Path;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  const commandNeedsShell = process.platform === "win32" && /\.(bat|cmd)$/i.test(command);
  const executable = commandNeedsShell ? "cmd.exe" : command;
  const executableArgs = commandNeedsShell ? ["/d", "/s", "/c", command, ...args] : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: options.cwd || root,
    env,
    encoding: "utf8",
    windowsHide: true,
    shell: Boolean(options.shell),
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    fail(`${options.label || command} failed with exit ${result.status}`);
  }
  return result.stdout || "";
}

function ensureLocalAvd() {
  mkdirSync(localAvdHome, { recursive: true });
  if (!existsSync(localAvdDir)) {
    const sourceAvdDir = path.join(sourceAvdHome, `${avdName}.avd`);
    if (!existsSync(sourceAvdDir)) fail(`Source AVD not found: ${sourceAvdDir}`);
    cpSync(sourceAvdDir, localAvdDir, { recursive: true });
  }
  writeFileSync(localAvdIni, [
    "avd.ini.encoding=UTF-8",
    `path=${localAvdDir}`,
    `path.rel=avd\\${avdName}.avd`,
    "target=android-35",
    "",
  ].join("\n"));
}

function adbOutput(args) {
  return spawnSync(adb, args, { cwd: root, env, encoding: "utf8", windowsHide: true }).stdout || "";
}

function waitForBoot(emulatorProcess) {
  for (let i = 0; i < 120; i += 1) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    const devices = adbOutput(["devices"]);
    if (/emulator-\d+\s+device/.test(devices)) {
      const boot = adbOutput(["shell", "getprop", "sys.boot_completed"]).trim();
      if (boot === "1") return true;
    }
    if (emulatorProcess.exitCode !== null) fail(`Android emulator exited early: ${emulatorProcess.exitCode}`);
  }
  return false;
}

function stopEmulator(emulatorProcess) {
  spawnSync(adb, ["emu", "kill"], { cwd: root, env, encoding: "utf8", windowsHide: true });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  if (emulatorProcess.exitCode === null) emulatorProcess.kill("SIGKILL");
}

ensureLocalAvd();
mkdirSync(env.APPDATA, { recursive: true });
mkdirSync(env.LOCALAPPDATA, { recursive: true });
mkdirSync(path.dirname(evidencePath), { recursive: true });

run(flutterBin, ["build", "apk", "--debug", "--target-platform", "android-x64"], { cwd: appDir, label: "flutter build apk" });
const apk = path.join(appDir, "build", "app", "outputs", "flutter-apk", "app-debug.apk");
if (!existsSync(apk) || statSync(apk).size < 10 * 1024 * 1024) fail("Debug APK is missing or too small.");

run(adb, ["kill-server"], { label: "adb kill-server" });
run(adb, ["start-server"], { label: "adb start-server" });

const emulatorProcess = spawn(emulator, [
  "-avd", avdName,
  "-no-window",
  "-no-audio",
  "-no-snapshot",
  "-gpu", "swiftshader_indirect",
  "-netdelay", "none",
  "-netspeed", "full",
], { cwd: root, env, windowsHide: true, stdio: "ignore" });

try {
  if (!waitForBoot(emulatorProcess)) fail("Android emulator boot timed out.");
  run(adb, ["install", "-r", apk], { label: "adb install" });
  run(adb, ["shell", "monkey", "-p", "com.miguelsusffalich.vibeapp", "-c", "android.intent.category.LAUNCHER", "1"], { label: "adb launch" });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 8000);
  const processId = adbOutput(["shell", "pidof", "com.miguelsusffalich.vibeapp"]).trim();
  const activity = adbOutput(["shell", "dumpsys", "activity", "activities"]);
  const launched = Boolean(processId) || /com\.miguelsusffalich\.vibeapp/.test(activity);
  const summary = {
    emulator: avdName,
    booted: true,
    installed: true,
    launched,
    processId,
    android: adbOutput(["shell", "getprop", "ro.build.version.release"]).trim(),
    api: adbOutput(["shell", "getprop", "ro.build.version.sdk"]).trim(),
    apkSize: statSync(apk).size,
    verifiedAt: new Date().toISOString(),
  };
  writeFileSync(evidencePath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (!launched) fail("Vibeapp was installed but not visible after launch.");
} finally {
  stopEmulator(emulatorProcess);
}

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "vibeapp");
const flutterBin = process.env.FLUTTER_BIN
  || path.join("C:", "Users", "msusf", "Documents", "Codex", "flutter-sdk", "bin", process.platform === "win32" ? "flutter.bat" : "flutter");
const javaHome = process.env.JAVA_HOME || path.join("C:", "Users", "msusf", "Documents", "Codex", "Java", "jdk-21");
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join("C:", "Users", "msusf", "Documents", "Codex", "Android", "sdk");
const toolHome = path.join(root, ".tool-home");
const appDataHome = path.join(toolHome, "appdata");
const localAppDataHome = path.join(toolHome, "localappdata");
mkdirSync(appDataHome, { recursive: true });
mkdirSync(localAppDataHome, { recursive: true });

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(existsSync(appDir), "vibeapp directory is missing.");
check(existsSync(flutterBin), `Flutter executable was not found: ${flutterBin}`);
check(existsSync(javaHome), `JDK 21 path was not found: ${javaHome}`);
check(existsSync(androidHome), `Android SDK path was not found: ${androidHome}`);

const files = {
  pubspec: readFileSync(path.join(appDir, "pubspec.yaml"), "utf8"),
  main: readFileSync(path.join(appDir, "lib", "main.dart"), "utf8"),
  test: readFileSync(path.join(appDir, "test", "widget_test.dart"), "utf8"),
  buildGradle: readFileSync(path.join(appDir, "android", "app", "build.gradle.kts"), "utf8"),
  settingsGradle: readFileSync(path.join(appDir, "android", "settings.gradle.kts"), "utf8"),
  manifest: readFileSync(path.join(appDir, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8"),
};

check(files.pubspec.includes("name: vibeapp"), "pubspec must identify the native app as vibeapp.");
check(files.pubspec.includes("image_picker") && files.pubspec.includes("record") && files.pubspec.includes("geolocator"), "vibeapp must keep camera/audio/location dependencies.");
check(files.buildGradle.includes('namespace = "io.vibeapp.mobile"'), "Android namespace must be io.vibeapp.mobile.");
check(files.buildGradle.includes('applicationId = "io.vibeapp.mobile"'), "Android applicationId must be io.vibeapp.mobile.");
check(files.buildGradle.includes("pilotRelease"), "Android release signing configuration must support the pilot upload key.");
check(files.settingsGradle.includes('com.android.application") version "8.13.1"'), "Android Gradle Plugin should remain pinned to 8.13.1 until plugin compatibility is rechecked.");
[
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.health.READ_STEPS",
  "android.permission.health.READ_HEART_RATE",
  "android.permission.health.READ_SLEEP",
  "com.google.android.apps.healthdata",
].forEach((permission) => check(files.manifest.includes(permission), `Android manifest is missing ${permission}.`));
[
  "class VibeAuthClient",
  "class ExperienceSyncClient",
  "class NativeQuickCommand",
  "class ActiveExperienceSession",
  "class HealthConnectPermissionPlan",
  "class HealthConnectRecordDraft",
  "class HealthConnectPreviewBundle",
  "HealthConnectBridgeCard",
  "Future<void> _capturePhoto",
  "Future<void> _captureVideo",
  "Future<void> _toggleAudioRecording",
  "Future<void> _captureLocation",
  "Future<void> _importBiometricFile",
  "Future<void> _importExternalSession",
  "stripNativeWakePhrase",
  "Vibeapp",
].forEach((needle) => check(files.main.includes(needle), `Native app is missing expected implementation: ${needle}.`));
check(files.test.includes("Native quick commands parse note, agenda, and experience actions"), "Flutter tests must cover V command parsing.");
check(files.test.includes("Health Connect bridge covers Samsung records and normalized payloads"), "Flutter tests must cover Health Connect/Samsung bridge.");
check(!/[\u00c3\u00c2\ufffd]/u.test(files.main + files.test), "Flutter source or tests contain mojibake characters.");

if (failures.length) {
  console.error("Flutter mobile preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const pathValue = [
  path.join(javaHome, "bin"),
  path.join(androidHome, "cmdline-tools", "latest", "bin"),
  path.join(androidHome, "platform-tools"),
  process.env.Path || process.env.PATH || "",
].join(path.delimiter);
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  APPDATA: appDataHome,
  LOCALAPPDATA: localAppDataHome,
  FLUTTER_SUPPRESS_ANALYTICS: "true",
  DART_SUPPRESS_ANALYTICS: "true",
  CI: "true",
  Path: pathValue,
  PATH: pathValue,
};

function runFlutter(args, label) {
  console.log(`\n[flutter] ${label}`);
  const result = process.platform === "win32"
    ? spawnSync(`"${flutterBin}" ${args.map((arg) => `"${String(arg).replaceAll('"', '\\"')}"`).join(" ")}`, [], {
      cwd: appDir,
      encoding: "utf8",
      env,
      shell: true,
      windowsHide: true,
    })
    : spawnSync(flutterBin, args, {
    cwd: appDir,
    encoding: "utf8",
    env,
    windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`Flutter command failed (${label}) with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

runFlutter(["--version"], "version");
if (!existsSync(path.join(appDir, ".dart_tool", "package_config.json"))) {
  runFlutter(["pub", "get"], "pub get");
}
runFlutter(["analyze"], "analyze");
runFlutter(["test"], "test");

if (process.env.VIBE_REBUILD_ANDROID === "1") {
  runFlutter(["build", "apk", "--release"], "build apk --release");
  runFlutter(["build", "appbundle", "--release"], "build appbundle --release");
}

console.log("Flutter mobile verification passed: source, Android contract, analyze, and tests are clean.");

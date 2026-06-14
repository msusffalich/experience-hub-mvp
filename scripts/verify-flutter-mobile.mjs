import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
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

function readDartLibraryTree(dir) {
  if (!existsSync(dir)) return "";
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return readDartLibraryTree(fullPath);
      if (entry.isFile() && entry.name.endsWith(".dart")) return readFileSync(fullPath, "utf8");
      return "";
    })
    .join("\n");
}

check(existsSync(appDir), "vibeapp directory is missing.");
check(existsSync(flutterBin), `Flutter executable was not found: ${flutterBin}`);
check(existsSync(javaHome), `JDK 21 path was not found: ${javaHome}`);
check(existsSync(androidHome), `Android SDK path was not found: ${androidHome}`);

const files = {
  pubspec: readFileSync(path.join(appDir, "pubspec.yaml"), "utf8"),
  main: readDartLibraryTree(path.join(appDir, "lib")),
  test: readFileSync(path.join(appDir, "test", "widget_test.dart"), "utf8"),
  buildGradle: readFileSync(path.join(appDir, "android", "app", "build.gradle.kts"), "utf8"),
  settingsGradle: readFileSync(path.join(appDir, "android", "settings.gradle.kts"), "utf8"),
  manifest: readFileSync(path.join(appDir, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8"),
  blueprint: readFileSync(path.join(root, "docs", "vibeapp-native-blueprint.md"), "utf8"),
  handoffProtocol: existsSync(path.join(root, "PROTOCOLO_VERSIONES_CODEX_WINDOWS_MAC.md"))
    ? readFileSync(path.join(root, "PROTOCOLO_VERSIONES_CODEX_WINDOWS_MAC.md"), "utf8")
    : "",
  compatibility: existsSync(path.join(root, "docs", "vibeapp-compatibility-matrix.md"))
    ? readFileSync(path.join(root, "docs", "vibeapp-compatibility-matrix.md"), "utf8")
    : "",
};

check(files.pubspec.includes("name: vibeapp"), "pubspec must identify the native app as vibeapp.");
check(files.pubspec.includes("image_picker") && files.pubspec.includes("record") && files.pubspec.includes("geolocator"), "vibeapp must keep camera/audio/location dependencies.");
const labelMatch = files.main.match(/vibeappBuildLabel\s*=\s*'Vibeapp\s+(\d+)'/);
const releaseMatch = files.main.match(/vibeappReleaseLabel\s*=\s*'([^']+)'/);
const buildMatch = files.pubspec.match(/^version:\s*\d+\.\d+\.\d+\+(\d+)/m);
check(Boolean(labelMatch), "Vibeapp build label is missing.");
check(Boolean(releaseMatch), "Vibeapp release label is missing.");
check(Boolean(buildMatch), "pubspec must expose iOS/Android build number.");
if (labelMatch && buildMatch) {
  check(labelMatch[1] === buildMatch[1], `Vibeapp UI label ${labelMatch[1]} must match pubspec build ${buildMatch[1]}.`);
}
if (labelMatch && releaseMatch) {
  check(releaseMatch[1].endsWith(`-${labelMatch[1]}`), `Release label must end with the Vibeapp build number ${labelMatch[1]}.`);
}
check(files.buildGradle.includes('namespace = "com.miguelsusffalich.vibeapp"'), "Android namespace must be com.miguelsusffalich.vibeapp.");
check(files.buildGradle.includes('applicationId = "com.miguelsusffalich.vibeapp"'), "Android applicationId must be com.miguelsusffalich.vibeapp.");
check(files.buildGradle.includes("pilotRelease"), "Android release signing configuration must support the current release/upload key.");
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
  "signInViaBackend",
  "/api/mobile/auth/sign-in",
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
[
  "showDialog<bool>",
  "AlertDialog",
  "allowedExtensions: const ['csv', 'json', 'zip']",
  "withData: true",
  "pickedFile.bytes",
  "fromOriginalArchive",
  "biometric_archive",
  "originalArchive",
  "Abriendo selector de archivos",
  "No se eligio archivo biometrico.",
].forEach((needle) => check(files.main.includes(needle), `Apple Health biometric import compatibility is missing: ${needle}.`));
[
  "Meta / Oakley / Ray-Ban",
  "Oura Ring",
  "Apple Health",
  "Samsung Health / Galaxy Watch",
  "Health Connect",
].forEach((needle) => check(files.main.includes(needle), `External device/source matrix is missing: ${needle}.`));
check(files.main.includes("Galeria / archivos del telefono"), "External device/source matrix is missing: Galeria / archivos del telefono.");
check(files.test.includes("Native quick commands parse note, agenda, and experience actions"), "Flutter tests must cover V command parsing.");
check(files.main.includes("isNativeWakeToken") && files.main.includes("looksLikeNativeActionCommand") && files.main.includes("by|bye|bay|vai"), "Flutter V command parser must handle real speech wake variants without unsafe false positives.");
check(
  files.main.includes("NativeQuickCommandType.listen")
    && files.main.includes("Vibe en linea")
    && files.main.includes("V escuchando continuo")
    && files.main.includes("speech_to_text"),
  "Flutter V command must give visible feedback and speech-to-text listening support when the user says only V.",
);
check(files.test.includes("Bye agenda") && files.test.includes("Vai inicia") && files.test.includes("stripNativeWakePhrase('bye')"), "Flutter tests must cover misheard V wake variants and the standalone bye guard.");
check(files.test.includes("NativeQuickCommand.parse('V')") && files.test.includes("NativeQuickCommand.parse('Hola V')") && files.test.includes("NativeQuickCommand.parse('Hi V')"), "Flutter tests must cover V-only listening feedback in Spanish and English.");
check(files.test.includes("Health Connect bridge covers Samsung records and normalized payloads"), "Flutter tests must cover Health Connect/Samsung bridge.");
check(files.test.includes("export.zip") && files.test.includes("biometric_archive") && files.test.includes("application/zip"), "Flutter tests must preserve Apple Health export.zip as biometric archive.");
check(files.blueprint.includes("Apple Health") && files.blueprint.includes("Health Connect") && files.blueprint.includes("Meta/Oakley"), "Native blueprint must retain Apple, Android/Health Connect, and Meta routes.");
check(files.compatibility.includes("Validado por codigo/tests en PC") && files.compatibility.includes("Validado por build/install en Mac") && files.compatibility.includes("Validado manualmente en iPhone"), "Compatibility matrix must define validation levels without ambiguous 'validated' language.");
[
  "iPhone / iOS",
  "iPad / iPadOS",
  "Android phone",
  "Android tablet",
  "Apple Health / Apple Watch",
  "Samsung Health / Samsung Watch / Galaxy Watch",
  "Oura Ring",
  "Meta / Oakley / Ray-Ban",
].forEach((needle) => check(files.compatibility.includes(needle), `Compatibility matrix must cover required target family: ${needle}.`));
check(files.compatibility.includes("Apple Health export.zip"), "Compatibility matrix must cover Apple Health export.zip.");
check(files.compatibility.includes("La meta de producto es compatibilidad total"), "Compatibility matrix must declare the full target universe as the product goal.");
[
  "Regla de autoridad",
  "Objetivo obligatorio antes de intercambiar",
  "Categoria:",
  "Cambio funcional nuevo",
  "Absorcion de cambio Mac",
  "Revalidacion sin cambio funcional",
  "Solo nota / sin codigo",
  "Paquete minimo",
  "Compuerta obligatoria",
  "Control de paquete limpio",
  "No pasar toda la carpeta",
  "Producto final",
].forEach((needle) => check(files.handoffProtocol.includes(needle), `PC/Mac handoff protocol is missing: ${needle}.`));
check(!/[\u00c3\u00c2\ufffd]/u.test(files.main + files.test + files.compatibility + files.handoffProtocol), "Flutter source, tests, compatibility matrix, or handoff protocol contain mojibake characters.");

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
const baseEnv = { ...process.env };
if (process.platform === "win32") {
  delete baseEnv.PATH;
  delete baseEnv.path;
} else {
  delete baseEnv.Path;
}
const env = {
  ...baseEnv,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  APPDATA: appDataHome,
  LOCALAPPDATA: localAppDataHome,
  FLUTTER_SUPPRESS_ANALYTICS: "true",
  DART_SUPPRESS_ANALYTICS: "true",
  CI: "true",
  ...(process.platform === "win32" ? { Path: pathValue } : { PATH: pathValue }),
};

function runFlutter(args, label) {
  console.log(`\n[flutter] ${label}`);
  const timeoutMs = label === "analyze" ? 180_000 : label === "test" ? 180_000 : 120_000;
  const result = process.platform === "win32"
    ? spawnSync(`"${flutterBin}" ${args.map((arg) => `"${String(arg).replaceAll('"', '\\"')}"`).join(" ")}`, [], {
      cwd: appDir,
      encoding: "utf8",
      env,
      shell: true,
      timeout: timeoutMs,
      windowsHide: true,
    })
    : spawnSync(flutterBin, args, {
    cwd: appDir,
    encoding: "utf8",
    env,
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    const timedOut = result.error.code === "ETIMEDOUT";
    console.error(timedOut
      ? `Flutter command timed out (${label}) after ${Math.round(timeoutMs / 1000)}s. This is an environment/tooling block, not a silent release pass.`
      : `Flutter command could not run (${label}): ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Flutter command failed (${label}) with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

runFlutter(["--version"], "version");
runFlutter(["pub", "get"], "pub get");
runFlutter(["analyze", "--no-pub"], "analyze");
runFlutter(["test", "--no-pub"], "test");

if (process.env.VIBE_REBUILD_ANDROID === "1") {
  runFlutter(["build", "apk", "--release"], "build apk --release");
  runFlutter(["build", "appbundle", "--release"], "build appbundle --release");
}

console.log("Flutter mobile verification passed: source, Android contract, analyze, and tests are clean.");

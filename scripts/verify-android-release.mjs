import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const apkPath = path.join(root, "vibeapp", "build", "app", "outputs", "flutter-apk", "app-release.apk");
const aabPath = path.join(root, "vibeapp", "build", "app", "outputs", "bundle", "release", "app-release.aab");
const keyPropertiesPath = path.join(root, "vibeapp", "android", "key.properties");
const keyExamplePath = path.join(root, "vibeapp", "android", "key.properties.example");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

function fileSize(filePath) {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

check(fileSize(apkPath) > 10 * 1024 * 1024, "Signed release APK is missing or too small.");
check(fileSize(aabPath) > 10 * 1024 * 1024, "Signed release AAB is missing or too small.");
check(existsSync(keyPropertiesPath), "Local Android key.properties is missing. It should exist locally and remain ignored by Git.");
check(existsSync(keyExamplePath), "Safe key.properties.example is missing.");

let gitIgnored = "";
try {
  gitIgnored = execFileSync("git", ["-c", "core.excludesFile=", "status", "--short", "--ignored", "vibeapp/android/key.properties"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
} catch (error) {
  failures.push(`Could not verify ignored key.properties: ${error.message}`);
}
check(gitIgnored.includes("!! vibeapp/android/key.properties"), "vibeapp/android/key.properties must be ignored by Git.");

let trackedSecrets = "";
try {
  trackedSecrets = execFileSync("git", ["-c", "core.excludesFile=", "ls-files", "vibeapp/android/key.properties", "*.jks", "*.keystore", "*.p12"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
} catch (error) {
  failures.push(`Could not inspect tracked signing secrets: ${error.message}`);
}
check(!trackedSecrets.trim(), `Signing secrets must not be tracked by Git: ${trackedSecrets.trim()}`);

const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "C:/Users/msusf/Documents/Codex/Android/sdk";
const buildTools = ["35.0.0", "36.0.0"]
  .map((version) => path.join(androidHome, "build-tools", version, process.platform === "win32" ? "apksigner.bat" : "apksigner"))
  .find((candidate) => existsSync(candidate));
check(Boolean(buildTools), "apksigner was not found in Android build-tools.");

if (buildTools) {
  const javaHome = process.env.JAVA_HOME || "C:/Users/msusf/Documents/Codex/Java/jdk-21";
  const pathValue = `${path.join(javaHome, "bin")}${path.delimiter}${process.env.Path || process.env.PATH || ""}`;
  const result = process.platform === "win32"
    ? spawnSync(`"${buildTools}" verify --verbose --print-certs "${apkPath}"`, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      shell: true,
      env: { ...process.env, JAVA_HOME: javaHome, Path: pathValue, PATH: pathValue },
    })
    : spawnSync(buildTools, ["verify", "--verbose", "--print-certs", apkPath], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, JAVA_HOME: javaHome, Path: pathValue, PATH: pathValue },
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  check(result.status === 0, `apksigner verification failed: ${output.trim()}`);
  check(output.includes("Verified using v2 scheme") && output.includes("true"), "APK must verify with Android signature scheme v2.");
  check(output.includes("CN=Vibeapp Pilot"), "APK signer certificate should be the local Vibeapp Pilot key.");
}

if (failures.length) {
  console.error("Android release verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Android release verification passed: signed APK, signed AAB, local key ignored, and APK signature verified.");

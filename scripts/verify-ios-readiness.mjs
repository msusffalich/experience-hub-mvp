import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "vibeapp");
const flutterBin = process.env.FLUTTER_BIN
  || path.join("C:", "Users", "msusf", "Documents", "Codex", "flutter-sdk", "bin", process.platform === "win32" ? "flutter.bat" : "flutter");

const files = {
  pubspec: readFileSync(path.join(appDir, "pubspec.yaml"), "utf8"),
  infoPlist: readFileSync(path.join(appDir, "ios", "Runner", "Info.plist"), "utf8"),
  project: readFileSync(path.join(appDir, "ios", "Runner.xcodeproj", "project.pbxproj"), "utf8"),
  scheme: readFileSync(path.join(appDir, "ios", "Runner.xcodeproj", "xcshareddata", "xcschemes", "Runner.xcscheme"), "utf8"),
  entitlements: readFileSync(path.join(appDir, "ios", "Runner", "Runner.entitlements"), "utf8"),
  readme: readFileSync(path.join(appDir, "README.md"), "utf8"),
};

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(files.pubspec.includes("name: vibeapp"), "pubspec must identify the app as vibeapp.");
check(files.project.includes("PRODUCT_BUNDLE_IDENTIFIER = com.miguelsusffalich.vibeapp;"), "iOS Runner bundle id must be com.miguelsusffalich.vibeapp for Personal Team testing.");
check(files.project.includes("PRODUCT_BUNDLE_IDENTIFIER = com.miguelsusffalich.vibeapp.RunnerTests;"), "iOS test bundle id must use com.miguelsusffalich.vibeapp.RunnerTests.");
check(files.project.includes("CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;"), "iOS project must reference Runner.entitlements.");
check(
  /<LaunchAction[\s\S]*buildConfiguration = "Release"/.test(files.scheme),
  "iOS Runner scheme LaunchAction must use Release so the app opens correctly from the iPhone icon.",
);
check(files.entitlements.includes("com.apple.developer.healthkit") && files.entitlements.includes("<true/>"), "HealthKit entitlement must be declared for iOS readiness.");
[
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
  "NSPhotoLibraryUsageDescription",
  "NSPhotoLibraryAddUsageDescription",
  "NSLocationWhenInUseUsageDescription",
  "NSHealthShareUsageDescription",
  "NSHealthUpdateUsageDescription",
].forEach((key) => check(files.infoPlist.includes(key), `Info.plist is missing ${key}.`));
check(files.readme.includes("iOS/Mac handoff") && files.readme.includes("Apple Developer"), "README must explain the iOS/Mac handoff.");
check(existsSync(path.join(appDir, "ios", "Runner.xcworkspace", "contents.xcworkspacedata")), "iOS workspace is missing.");

if (failures.length) {
  console.error("iOS readiness verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (process.platform === "darwin" && process.env.VIBE_IOS_BUILD === "1") {
  if (!existsSync(flutterBin)) {
    console.error(`Flutter executable was not found: ${flutterBin}`);
    process.exit(1);
  }
  console.log("\n[flutter] build ios --debug --no-codesign");
  const result = spawnSync(flutterBin, ["build", "ios", "--debug", "--no-codesign"], {
    cwd: appDir,
    encoding: "utf8",
    env: { ...process.env, FLUTTER_SUPPRESS_ANALYTICS: "true", DART_SUPPRESS_ANALYTICS: "true" },
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`iOS no-codesign build failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

const buildNote = process.platform === "darwin"
  ? "Set VIBE_IOS_BUILD=1 to run flutter build ios --debug --no-codesign on this Mac."
  : "Static readiness passed on Windows; Xcode signing/build still requires the user's Mac.";
console.log(`iOS readiness verification passed for Vibeapp. ${buildNote}`);

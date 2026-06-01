import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const pwaVersion = readFileSync(path.join(root, "app.js"), "utf8").match(/const APP_VERSION = "([^"]+)";/)?.[1] || "unknown";
const pubspec = readFileSync(path.join(root, "vibeapp", "pubspec.yaml"), "utf8");
const vibeappVersion = pubspec.match(/^version:\s*(.+)$/m)?.[1]?.trim() || "0.0.0+0";
const bundleId = "io.vibeapp.mobile";
const sourceDir = path.join(root, "vibeapp");
const outDir = path.join(root, "dist", "vibeapp-ios-handoff");
const sourceOutDir = path.join(outDir, "vibeapp");
const zipName = `vibeapp-ios-handoff-${pwaVersion}.zip`;
const zipPath = path.join(root, "dist", zipName);
const zipChecksumPath = `${zipPath}.sha256`;

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

console.log("Verifying iOS readiness before packaging...");
const verifyResult = process.platform === "win32"
  ? spawnSync("npm.cmd run verify:ios", [], { cwd: root, encoding: "utf8", shell: true, windowsHide: true })
  : spawnSync("npm", ["run", "verify:ios"], { cwd: root, encoding: "utf8", windowsHide: true });
if (verifyResult.stdout) process.stdout.write(verifyResult.stdout);
if (verifyResult.stderr) process.stderr.write(verifyResult.stderr);
if (verifyResult.status !== 0) {
  throw new Error(`iOS readiness verification failed before packaging: exit ${verifyResult.status}`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(sourceOutDir, { recursive: true });

[
  "lib",
  "ios",
  "test",
].forEach((folder) => cpSync(path.join(sourceDir, folder), path.join(sourceOutDir, folder), { recursive: true }));
[
  "pubspec.yaml",
  "pubspec.lock",
  "analysis_options.yaml",
  "README.md",
].forEach((file) => copyFileSync(path.join(sourceDir, file), path.join(sourceOutDir, file)));

const keyFiles = [
  "vibeapp/pubspec.yaml",
  "vibeapp/ios/Runner/Info.plist",
  "vibeapp/ios/Runner/Runner.entitlements",
  "vibeapp/ios/Runner.xcodeproj/project.pbxproj",
  "vibeapp/README.md",
].map((relativePath) => {
  const filePath = path.join(outDir, relativePath);
  return {
    file: relativePath,
    size: statSync(filePath).size,
    sizeLabel: formatBytes(statSync(filePath).size),
    sha256: sha256(filePath),
  };
});

const generatedAt = new Date().toISOString();
const manifest = {
  generatedAt,
  packageName: "vibeapp-ios-mac-handoff",
  pwaVersion,
  vibeappVersion,
  bundleId,
  backendUrl: "https://experience-hub-web-production.up.railway.app",
  requiredPreMacCheck: "npm run verify:ios",
  requiredMacCheck: "VIBE_IOS_BUILD=1 npm run verify:ios",
  signing: {
    requiresMac: true,
    requiresXcode: true,
    requiresAppleDeveloperTeam: true,
    signingMaterialIncluded: false,
  },
  capabilities: [
    "Camera",
    "Microphone",
    "Photo Library",
    "Location When In Use",
    "HealthKit entitlement",
  ],
  pilotFlow: [
    "Open vibeapp/ios/Runner.xcworkspace on the Mac.",
    "Select the Apple Developer Team for Runner.",
    "Confirm bundle id io.vibeapp.mobile and HealthKit capability.",
    "Run a no-codesign build or build/install from Xcode.",
    "Install on iPhone/iPad and test sign-in, quick note, active experience, camera, video, audio, location, queue retry, Apple Health export/import, and PWA handoff.",
  ],
  files: keyFiles,
};

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
writeFileSync(
  path.join(outDir, "checksums.sha256"),
  keyFiles.map((file) => `${file.sha256}  ${file.file}`).join("\n") + "\n",
);
writeFileSync(
  path.join(outDir, "README.md"),
  `# Vibeapp iOS/Mac handoff package

Generated: ${generatedAt}
PWA version: ${pwaVersion}
Vibeapp version: ${vibeappVersion}
iOS bundle id: ${bundleId}
Backend: https://experience-hub-web-production.up.railway.app

## Purpose

This package is for the Mac/Xcode session. It does not include signing certificates, provisioning profiles, passwords, or an installed iOS binary.

## Validate before opening Xcode

\`\`\`bash
npm run verify:ios
\`\`\`

On the Mac, from the repo root:

\`\`\`bash
flutter pub get
VIBE_IOS_BUILD=1 npm run verify:ios
\`\`\`

## Xcode path

1. Open \`vibeapp/ios/Runner.xcworkspace\`.
2. Select Runner > Signing & Capabilities.
3. Choose the Apple Developer Team.
4. Confirm bundle id \`${bundleId}\`.
5. Confirm HealthKit capability and \`Runner/Runner.entitlements\`.
6. Build and install on iPhone/iPad.

## First device test

1. Verify backend URL points to production Vibe.
2. Sign in with the same account used in the PWA.
3. Create a quick note.
4. Start an active experience.
5. Add camera photo/video, audio, location, and a file import.
6. Close the experience.
7. Open the PWA and verify Library, Assets, Reports, Findings, and Publications see the record.

## Security

Signing materials are intentionally not included. Keep Apple certificates, profiles, and account credentials outside Git and outside handoff packages.
`,
);

rmSync(zipPath, { force: true });
rmSync(zipChecksumPath, { force: true });
console.log("Creating iOS handoff ZIP...");
const zipResult = process.platform === "win32"
  ? spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${outDir.replaceAll("'", "''")}\\*' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`,
  ], { cwd: root, encoding: "utf8", windowsHide: true })
  : spawnSync("zip", ["-qr", zipPath, "."], { cwd: outDir, encoding: "utf8", windowsHide: true });
if (zipResult.stdout) process.stdout.write(zipResult.stdout);
if (zipResult.stderr) process.stderr.write(zipResult.stderr);
if (zipResult.status !== 0 || !existsSync(zipPath)) {
  throw new Error(`Could not create iOS handoff ZIP: exit ${zipResult.status}`);
}
const zipHash = sha256(zipPath);
writeFileSync(zipChecksumPath, `${zipHash}  ${zipName}\n`);

console.log(`Vibeapp iOS handoff package ready: ${path.relative(root, outDir)}`);
console.log(`ZIP: ${path.relative(root, zipPath)} - ${formatBytes(statSync(zipPath).size)} - ${zipHash}`);

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const pwaVersion = readFileSync(path.join(root, "app.js"), "utf8").match(/const APP_VERSION = "([^"]+)";/)?.[1] || "unknown";
const pubspec = readFileSync(path.join(root, "vibeapp", "pubspec.yaml"), "utf8");
const vibeappVersion = pubspec.match(/^version:\s*(.+)$/m)?.[1]?.trim() || "0.0.0+0";
const packageId = "com.miguelsusffalich.vibeapp";
const outDir = path.join(root, "dist", "vibeapp-pilot");
const zipName = `vibeapp-pilot-${pwaVersion}.zip`;
const zipPath = path.join(root, "dist", zipName);
const zipChecksumPath = `${zipPath}.sha256`;
const artifacts = [
  {
    kind: "apk",
    label: "APK release firmado para instalacion directa",
    source: path.join(root, "vibeapp", "build", "app", "outputs", "flutter-apk", "app-release.apk"),
    target: "vibeapp-pilot-release.apk",
    use: "Instalacion manual en Android fisico de piloto.",
  },
  {
    kind: "aab",
    label: "AAB release firmado para Play Console",
    source: path.join(root, "vibeapp", "build", "app", "outputs", "bundle", "release", "app-release.aab"),
    target: "vibeapp-pilot-release.aab",
    use: "Subida a pista interna de Play Console.",
  },
];

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

console.log("Verifying signed Android release before packaging...");
const verifyResult = process.platform === "win32"
  ? spawnSync("npm.cmd run verify:android", [], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    windowsHide: true,
  })
  : spawnSync("npm", ["run", "verify:android"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
});
if (verifyResult.stdout) process.stdout.write(verifyResult.stdout);
if (verifyResult.stderr) process.stderr.write(verifyResult.stderr);
if (verifyResult.status !== 0) {
  throw new Error(`Android verification failed before packaging: exit ${verifyResult.status}`);
}

for (const artifact of artifacts) {
  if (!existsSync(artifact.source)) {
    throw new Error(`Missing artifact: ${artifact.source}`);
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const packagedArtifacts = artifacts.map((artifact) => {
  const targetPath = path.join(outDir, artifact.target);
  copyFileSync(artifact.source, targetPath);
  const size = statSync(targetPath).size;
  return {
    kind: artifact.kind,
    label: artifact.label,
    file: artifact.target,
    size,
    sizeLabel: formatBytes(size),
    sha256: sha256(targetPath),
    use: artifact.use,
  };
});

const generatedAt = new Date().toISOString();
const manifest = {
  generatedAt,
  packageName: "vibeapp-android-pilot",
  pwaVersion,
  vibeappVersion,
  applicationId: packageId,
  backendUrl: "https://experience-hub-web-production.up.railway.app",
  requiredCheck: "npm run verify:pilot",
  security: {
    signingKeyIncluded: false,
    note: "El paquete incluye APK/AAB firmados, pero nunca incluye key.properties, keystores ni passwords.",
  },
  delivery: {
    folder: "dist/vibeapp-pilot",
    zip: `dist/${zipName}`,
    zipChecksum: `dist/${zipName}.sha256`,
  },
  artifacts: packagedArtifacts,
  pilotFlow: [
    "Instalar el APK en un Android fisico o subir el AAB a Play Console interna.",
    "Entrar con el mismo usuario Supabase usado en la PWA.",
    "Crear una captura con texto, foto, video, audio, ubicacion y/o biometria.",
    "Confirmar en la PWA que aparece en Libreria, Activos, Reportes, Hallazgos y Publicaciones.",
  ],
};

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
writeFileSync(
  path.join(outDir, "checksums.sha256"),
  packagedArtifacts.map((artifact) => `${artifact.sha256}  ${artifact.file}`).join("\n") + "\n",
);
writeFileSync(
  path.join(outDir, "README.md"),
  `# Vibeapp Android pilot package

Generated: ${generatedAt}
PWA version: ${pwaVersion}
Vibeapp version: ${vibeappVersion}
Android package: ${packageId}
Backend: https://experience-hub-web-production.up.railway.app

## Included files

${packagedArtifacts.map((artifact) => `- ${artifact.file}: ${artifact.label} (${artifact.sizeLabel}).\n  - Uso: ${artifact.use}\n  - SHA-256: \`${artifact.sha256}\``).join("\n")}

## Delivery files

- Folder: \`dist/vibeapp-pilot\`
- Transfer ZIP: \`dist/${zipName}\`
- ZIP checksum: \`dist/${zipName}.sha256\`

## Pilot install path

1. For a fast device test, copy \`vibeapp-pilot-release.apk\` to the Android phone and install it.
2. For a controlled tester group, upload \`vibeapp-pilot-release.aab\` to an internal Play Console track.
3. Sign in with the same Supabase user used in the PWA.
4. Capture text, photo, video, audio, location and/or biometric files.
5. Verify the same record in the PWA: Library, Assets, Reports, Findings and Publications.

## Security

This folder intentionally does not include signing keys, \`key.properties\`, keystores or passwords. Keep those outside Git and outside pilot delivery packages.
`,
);

rmSync(zipPath, { force: true });
rmSync(zipChecksumPath, { force: true });
console.log("Creating transfer ZIP...");
const zipResult = process.platform === "win32"
  ? spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${outDir.replaceAll("'", "''")}\\*' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`,
  ], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  })
  : spawnSync("zip", ["-qr", zipPath, "."], {
    cwd: outDir,
    encoding: "utf8",
    windowsHide: true,
  });
if (zipResult.stdout) process.stdout.write(zipResult.stdout);
if (zipResult.stderr) process.stderr.write(zipResult.stderr);
if (zipResult.status !== 0 || !existsSync(zipPath)) {
  throw new Error(`Could not create transfer ZIP: exit ${zipResult.status}`);
}
const zipHash = sha256(zipPath);
writeFileSync(zipChecksumPath, `${zipHash}  ${zipName}\n`);

console.log(`Vibeapp pilot package ready: ${path.relative(root, outDir)}`);
for (const artifact of packagedArtifacts) {
  console.log(`- ${artifact.file}: ${artifact.sizeLabel} · ${artifact.sha256}`);
}

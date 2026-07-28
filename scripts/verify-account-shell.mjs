import { readFileSync } from "node:fs";

const accountShell = readFileSync("account-shell.js", "utf8");
const app = readFileSync("app.js", "utf8");
const index = readFileSync("index.html", "utf8");
const serviceWorker = readFileSync("service-worker.js", "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(accountShell.includes("global.VibeAccountShell = Object.freeze"), "Account shell must expose one immutable public contract.");
expect(accountShell.includes("function escapeHtml("), "Account shell must escape user-facing values.");
expect(accountShell.includes("function renderSignedIn("), "Signed-in account renderer is missing.");
expect(accountShell.includes("function renderSignedOutIntro("), "Signed-out account intro renderer is missing.");
expect(accountShell.includes("function resolveAction("), "Account action resolver is missing.");
["help", "operation", "privacy", "profile", "automation"].forEach((action) => {
  expect(accountShell.includes(`${action}: Object.freeze(`), `Account route is missing: ${action}.`);
});
expect(accountShell.includes('normalized === "signout"'), "Sign-out must remain an explicit account action.");
expect(!accountShell.includes("access_token") && !accountShell.includes("refresh_token"), "Account shell must not own authentication tokens.");
expect(!accountShell.includes("apiRequest(") && !accountShell.includes("localStorage"), "Account shell must remain free of persistence and API effects.");
expect(app.includes("window.VibeAccountShell?.renderSignedIn"), "app.js must delegate signed-in account rendering.");
expect(app.includes("window.VibeAccountShell?.renderSignedOutIntro"), "app.js must delegate the signed-out account intro.");
expect(app.includes("window.VibeAccountShell?.resolveAction(action)"), "app.js must delegate account action resolution.");
expect(index.indexOf("product-shell.js") < index.indexOf("account-shell.js"), "Product shell must load before account shell.");
expect(index.indexOf("account-shell.js") < index.indexOf("app.js"), "Account shell must load before app.js.");
expect(serviceWorker.includes('"/account-shell.js"'), "Account shell must bypass stale service-worker cache.");
[
  '"Mi cuenta", "My account", "Mon compte", "Minha conta"',
  '"Perfil y dispositivos", "Profile and devices", "Profil et appareils", "Perfil e dispositivos"',
  '"Privacidad y respaldos", "Privacy and backups", "Confidentialité et sauvegardes", "Privacidade e backups"',
  '"Operación", "Operation", "Opération", "Operação"',
].forEach((copy) => {
  expect(app.includes(copy), `Account locale contract is incomplete: ${copy}.`);
});

if (failures.length) {
  console.error("Account shell verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Account shell verification passed.");

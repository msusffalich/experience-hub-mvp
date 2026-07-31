// Escritura directa en la bóveda de Obsidian del propio equipo.
//
// Por qué existe: la bóveda del servidor vive en el contenedor de Railway, no
// en el disco del usuario, así que una exportación server-side nunca llega a la
// bóveda real. La app legacy resolvía esto dejando elegir la carpeta con la
// File System Access API y escribiendo directamente. Esto porta ese flujo.
//
// Contrato respetado: en 02_Experiences/ se reemplaza SOLO el bloque
// <!-- vibe:auto -->...<!-- /vibe:auto --> y se conserva literalmente todo lo
// que va después (la curaduría humana). Una nota sin marcadores no se pisa:
// se versiona con sufijo.

const AUTO_END = "<!-- /vibe:auto -->";
const DB_NAME = "vibe-next-vault";
const STORE_NAME = "handles";
const HANDLE_KEY = "obsidian-vault";

export function isVaultPickerSupported() {
  return Boolean(typeof window !== "undefined" && window.showDirectoryPicker && window.indexedDB);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function ensurePermission(handle, mode = "readwrite") {
  if (!handle?.queryPermission || !handle?.requestPermission) return "denied";
  let permission = await handle.queryPermission({ mode });
  if (permission !== "granted") permission = await handle.requestPermission({ mode });
  return permission;
}

async function hasChildDirectory(parent, name) {
  try {
    await parent.getDirectoryHandle(name, { create: false });
    return true;
  } catch {
    return false;
  }
}

// Una bóveda de Obsidian se reconoce por su carpeta `.obsidian`. Si el usuario
// eligió la carpeta PADRE (error frecuente) y dentro hay exactamente una
// bóveda, se corrige sola en vez de fallar.
async function resolveVaultHandle(selected) {
  if (!selected) throw new Error("obsidian_vault_not_selected");
  if (await hasChildDirectory(selected, ".obsidian")) {
    return { handle: selected, correctedFromParent: false };
  }
  const children = [];
  if (selected.values) {
    for await (const entry of selected.values()) {
      if (entry.kind !== "directory") continue;
      if (await hasChildDirectory(entry, ".obsidian")) children.push(entry);
    }
  }
  if (children.length === 1) {
    return { handle: children[0], correctedFromParent: true, parentName: selected.name || "" };
  }
  if (children.length > 1) throw new Error("obsidian_multiple_vaults_found");
  throw new Error("obsidian_vault_marker_missing");
}

export async function pickVault() {
  if (!isVaultPickerSupported()) throw new Error("obsidian_picker_unsupported");
  const selected = await window.showDirectoryPicker({ id: "vibe-obsidian-vault", mode: "readwrite" });
  const resolved = await resolveVaultHandle(selected);
  if ((await ensurePermission(resolved.handle)) !== "granted") {
    throw new Error("obsidian_permission_denied");
  }
  await idbPut(HANDLE_KEY, resolved.handle);
  return {
    name: resolved.handle.name || "",
    correctedFromParent: resolved.correctedFromParent,
    parentName: resolved.parentName || "",
  };
}

export async function forgetVault() {
  await idbDelete(HANDLE_KEY).catch(() => {});
}

// Devuelve el handle guardado solo si el permiso sigue concedido. `interactive`
// permite volver a pedirlo (requiere gesto del usuario).
export async function getStoredVault({ interactive = false } = {}) {
  if (!isVaultPickerSupported()) return null;
  const handle = await idbGet(HANDLE_KEY).catch(() => null);
  if (!handle) return null;
  const mode = { mode: "readwrite" };
  let permission = await handle.queryPermission?.(mode);
  if (permission !== "granted" && interactive) {
    permission = await handle.requestPermission?.(mode);
  }
  if (permission !== "granted") return null;
  if (!(await hasChildDirectory(handle, ".obsidian"))) return null;
  return handle;
}

async function directoryFor(vault, segments) {
  let current = vault;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

async function readIfExists(directory, name) {
  try {
    const fileHandle = await directory.getFileHandle(name, { create: false });
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return "";
  }
}

async function writeText(directory, name, content) {
  const fileHandle = await directory.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function nextAvailableName(directory, name) {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${stem} ${index}${extension}`;
    try {
      await directory.getFileHandle(candidate, { create: false });
    } catch {
      return candidate;
    }
  }
  return `${stem} ${Date.now()}${extension}`;
}

// Escribe el paquete en la bóveda. Devuelve el detalle de lo ocurrido para que
// la interfaz pueda ser honesta (escritos / preservados / versionados / fallos).
export async function writeBundleToVault(vault, files = []) {
  const summary = { written: 0, preserved: 0, versioned: [], failed: [] };
  for (const file of files) {
    const path = String(file?.path || "").trim();
    if (!path || typeof file.markdown !== "string") continue;
    const segments = path.split("/").filter((segment) => segment && segment !== "." && segment !== "..");
    const name = segments.pop();
    if (!name) continue;
    try {
      const directory = await directoryFor(vault, segments);
      const isExperience = path.startsWith("02_Experiences/");
      if (!isExperience) {
        await writeText(directory, name, file.markdown);
        summary.written += 1;
        continue;
      }
      const existing = await readIfExists(directory, name);
      if (!existing.trim()) {
        await writeText(directory, name, file.markdown);
        summary.written += 1;
        continue;
      }
      const existingEnd = existing.indexOf(AUTO_END);
      if (existingEnd < 0) {
        // Nota sin marcadores: no es nuestra o se escribió a mano. No se pisa.
        const alternative = await nextAvailableName(directory, name);
        await writeText(directory, alternative, file.markdown);
        summary.versioned.push(`${segments.join("/")}/${alternative}`);
        continue;
      }
      const humanZone = existing.slice(existingEnd + AUTO_END.length);
      const generatedEnd = file.markdown.indexOf(AUTO_END);
      const generatedAuto = generatedEnd >= 0
        ? file.markdown.slice(0, generatedEnd + AUTO_END.length)
        : file.markdown;
      const hasLearnings = /###\s*Aprendizajes\s*\n+\s*\S/.test(humanZone);
      const merged = `${generatedAuto.replace(
        /^learnings:\s*(?:pending|ok)\s*$/m,
        `learnings: ${hasLearnings ? "ok" : "pending"}`,
      )}${humanZone}`;
      await writeText(directory, name, merged);
      summary.written += 1;
      if (humanZone.trim()) summary.preserved += 1;
    } catch (error) {
      summary.failed.push({ path, error: String(error?.message || error) });
    }
  }
  return summary;
}

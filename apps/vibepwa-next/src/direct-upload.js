import { request } from "./api.js";
import {
  deleteTransferCheckpoint,
  getTransferCheckpoint,
  setTransferCheckpoint,
} from "./upload-queue.js";

const STANDARD_LIMIT = 6 * 1024 * 1024;

export async function uploadEvidence(file, options = {}) {
  const captureId = options.captureId || crypto.randomUUID();
  const idempotencyKey = options.idempotencyKey || `web-${captureId}`;
  const checksum = await sha256(file);
  const kind = inferKind(file);
  const command = {
    captureId,
    idempotencyKey,
    intent: kind === "biometric" ? "context" : "evidence",
    kind,
    occurredAt: options.occurredAt || new Date(file.lastModified || Date.now()).toISOString(),
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    checksum,
    participantId: options.participantId || "",
    source: {
      app: "vibepwa",
      platform: "web",
      ...options.source,
      capturedOffline: options.capturedOffline === true,
    },
    metadata: {
      ...options.metadata,
      caption: options.caption || "",
      originalLastModified: file.lastModified || null,
    },
  };
  const authorization = await request("/api/v2/captures/uploads", {
    method: "POST",
    body: command,
  });
  if (authorization.uploadRequired) {
    try {
      if (authorization.upload.mode === "resumable" || file.size > STANDARD_LIMIT) {
        await uploadTus(file, authorization.upload, options.onProgress);
      } else {
        await uploadStandard(file, authorization.upload, options.onProgress);
      }
    } catch (uploadError) {
      // A mobile network can drop the response after Storage persisted the
      // bytes. Confirm before asking the user to send the file again.
      try {
        return await request("/api/v2/captures/commit", {
          method: "POST",
          body: command,
        });
      } catch {
        throw uploadError;
      }
    }
  }
  return request("/api/v2/captures/commit", {
    method: "POST",
    body: command,
  });
}

async function uploadStandard(file, upload, onProgress) {
  onProgress?.(15);
  const response = await fetchWithRetry(upload.signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: file,
  }, [0, 1000, 3000]);
  if (!response.ok) throw new Error(`storage_upload_${response.status}`);
  onProgress?.(85);
}

async function uploadTus(file, upload, onProgress) {
  const resumeKey = tusResumeKey(file, upload);
  let location = await getTransferCheckpoint(resumeKey);
  let offset = location ? await readTusOffset(location, upload.token) : null;
  if (offset == null || offset > file.size) {
    await deleteTransferCheckpoint(resumeKey);
    const createResponse = await fetchWithRetry(upload.tusEndpoint, {
      method: "POST",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(file.size),
        "Upload-Metadata": upload.headers["Upload-Metadata"],
        "x-signature": upload.token,
        "x-upsert": "false",
      },
    }, [0, 1000, 3000, 7000]);
    if (!createResponse.ok) throw new Error(`tus_create_${createResponse.status}`);
    const locationHeader = createResponse.headers.get("Location");
    if (!locationHeader) throw new Error("tus_location_missing");
    location = new URL(locationHeader, upload.tusEndpoint).toString();
    await setTransferCheckpoint(resumeKey, location);
    offset = Number(createResponse.headers.get("Upload-Offset") || 0);
  }
  const chunkBytes = Number(upload.chunkBytes || STANDARD_LIMIT);
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(file.size, offset + chunkBytes));
    const response = await fetchWithRetry(location, {
      method: "PATCH",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(offset),
        "Content-Type": "application/offset+octet-stream",
        "x-signature": upload.token,
      },
      body: chunk,
    }, [0, 1000, 3000, 7000, 15000]);
    if (response.status === 409) {
      const remoteOffset = await readTusOffset(location, upload.token);
      if (remoteOffset == null) throw new Error("tus_resume_lost");
      offset = remoteOffset;
      continue;
    }
    if (!response.ok) throw new Error(`tus_patch_${response.status}`);
    offset = Number(response.headers.get("Upload-Offset") || offset + chunk.size);
    onProgress?.(Math.min(85, Math.round((offset / file.size) * 80)));
  }
  await deleteTransferCheckpoint(resumeKey);
}

async function readTusOffset(location, token) {
  try {
    const response = await fetch(location, {
      method: "HEAD",
      headers: {
        "Tus-Resumable": "1.0.0",
        "x-signature": token,
      },
    });
    if (!response.ok) return null;
    const offset = Number(response.headers.get("Upload-Offset"));
    return Number.isFinite(offset) && offset >= 0 ? offset : null;
  } catch {
    return null;
  }
}

async function fetchWithRetry(url, options, delays) {
  let lastError;
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(url, options);
      if (response.status < 500 && response.status !== 408 && response.status !== 429) return response;
      lastError = new Error(`upload_http_${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("upload_failed");
}

function tusResumeKey(file, upload) {
  const identity = `${upload.bucket || ""}:${upload.path || ""}:${file.size}:${file.lastModified || 0}`;
  return `vibe-tus:${identity}`;
}

async function sha256(file) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function inferKind(file) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if ((type.includes("csv") || name.endsWith(".csv")) && /health|biometr|oura|sleep|heart/i.test(name)) {
    return "biometric";
  }
  return "document";
}

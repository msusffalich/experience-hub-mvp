const DATABASE_NAME = "vibe-upload-queue-v2";
const DATABASE_VERSION = 1;
const UPLOAD_STORE = "uploads";
const CHECKPOINT_STORE = "transfer-checkpoints";

let databasePromise;

export async function enqueueUpload(file, options = {}) {
  assertBlob(file);
  const captureId = options.captureId || crypto.randomUUID();
  const idempotencyKey = options.idempotencyKey || `web-${captureId}`;
  const occurredAt = normalizeOccurredAt(
    options.occurredAt,
    file.lastModified,
  );
  const existing = await findExistingUpload(captureId, idempotencyKey);
  if (existing) return toPublicEntry(existing, true);

  const now = new Date().toISOString();
  const entry = {
    queueId: captureId,
    captureId,
    idempotencyKey,
    occurredAt,
    filename: options.filename || file.name || `capture-${captureId}`,
    mimeType: options.mimeType || file.type || "application/octet-stream",
    sizeBytes: file.size,
    lastModified: Number(file.lastModified || Date.parse(occurredAt) || Date.now()),
    blob: file,
    participantId: String(options.participantId || ""),
    caption: String(options.caption || ""),
    metadata: cloneSerializable(options.metadata || {}),
    source: cloneSerializable(options.source || {}),
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    lastAttemptAt: null,
    lastError: null,
  };
  await putRecord(UPLOAD_STORE, entry);
  return toPublicEntry(entry, true);
}

export async function listQueuedUploads(options = {}) {
  const records = await getAllRecords(UPLOAD_STORE);
  const statuses = Array.isArray(options.statuses)
    ? new Set(options.statuses.map(String))
    : null;
  return records
    .filter((entry) => !statuses || statuses.has(entry.status))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((entry) => toPublicEntry(entry, options.includeBlob === true));
}

export async function getQueuedUpload(queueId, options = {}) {
  const entry = await getRecord(UPLOAD_STORE, String(queueId || ""));
  return entry ? toPublicEntry(entry, options.includeBlob === true) : null;
}

export async function removeQueuedUpload(queueId) {
  const key = String(queueId || "");
  if (!key) return false;
  const existed = Boolean(await getRecord(UPLOAD_STORE, key));
  if (existed) await deleteRecord(UPLOAD_STORE, key);
  return existed;
}

export async function retryQueuedUpload(queueId, uploader, options = {}) {
  if (typeof uploader !== "function") {
    throw new TypeError("upload_queue_uploader_required");
  }
  const key = String(queueId || "");
  const entry = await getRecord(UPLOAD_STORE, key);
  if (!entry) throw new Error("upload_queue_item_not_found");

  const attemptStartedAt = new Date().toISOString();
  const attempting = {
    ...entry,
    status: "uploading",
    attempts: Number(entry.attempts || 0) + 1,
    lastAttemptAt: attemptStartedAt,
    updatedAt: attemptStartedAt,
    lastError: null,
  };
  await putRecord(UPLOAD_STORE, attempting);
  options.onStateChange?.(toPublicEntry(attempting, false));

  try {
    const file = restoreFile(attempting);
    const result = await uploader(file, {
      captureId: attempting.captureId,
      idempotencyKey: attempting.idempotencyKey,
      occurredAt: attempting.occurredAt,
      participantId: attempting.participantId,
      caption: attempting.caption,
      metadata: attempting.metadata,
      source: attempting.source,
      capturedOffline: true,
      onProgress: options.onProgress,
    });
    await deleteRecord(UPLOAD_STORE, key);
    options.onStateChange?.({
      ...toPublicEntry(attempting, false),
      status: "completed",
      updatedAt: new Date().toISOString(),
    });
    return {
      queueId: key,
      captureId: attempting.captureId,
      idempotencyKey: attempting.idempotencyKey,
      result,
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failed = {
      ...attempting,
      status: "retry_pending",
      updatedAt: failedAt,
      lastError: serializeError(error),
    };
    await putRecord(UPLOAD_STORE, failed);
    options.onStateChange?.(toPublicEntry(failed, false));
    throw error;
  }
}

export async function drainUploadQueue(uploader, options = {}) {
  if (typeof uploader !== "function") {
    throw new TypeError("upload_queue_uploader_required");
  }
  await recoverInterruptedUploads();
  const pending = await listQueuedUploads({
    statuses: ["pending", "retry_pending"],
  });
  const summary = {
    attempted: 0,
    completed: 0,
    failed: 0,
    remaining: pending.length,
    errors: [],
  };

  for (const item of pending) {
    if (options.signal?.aborted) break;
    summary.attempted += 1;
    options.onItemStart?.(item);
    try {
      const completed = await retryQueuedUpload(item.queueId, uploader, {
        onProgress: (progress) => options.onProgress?.(item, progress),
        onStateChange: options.onStateChange,
      });
      summary.completed += 1;
      options.onItemComplete?.(item, completed.result);
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({
        queueId: item.queueId,
        error: serializeError(error),
      });
      options.onItemError?.(item, error);
      if (options.stopOnError === true) break;
    }
  }

  summary.remaining = (await listQueuedUploads()).length;
  return summary;
}

export async function getUploadQueueSummary() {
  const entries = await listQueuedUploads();
  return entries.reduce(
    (summary, entry) => {
      summary.total += 1;
      summary[entry.status] = (summary[entry.status] || 0) + 1;
      return summary;
    },
    {
      total: 0,
      pending: 0,
      uploading: 0,
      retry_pending: 0,
    },
  );
}

export async function setTransferCheckpoint(key, value) {
  const checkpointKey = String(key || "");
  if (!checkpointKey) throw new Error("transfer_checkpoint_key_required");
  await putRecord(CHECKPOINT_STORE, {
    key: checkpointKey,
    value: String(value || ""),
    updatedAt: new Date().toISOString(),
  });
}

export async function getTransferCheckpoint(key) {
  const record = await getRecord(CHECKPOINT_STORE, String(key || ""));
  return record?.value || "";
}

export async function deleteTransferCheckpoint(key) {
  const checkpointKey = String(key || "");
  if (checkpointKey) await deleteRecord(CHECKPOINT_STORE, checkpointKey);
}

async function recoverInterruptedUploads() {
  const entries = await getAllRecords(UPLOAD_STORE);
  const interrupted = entries.filter((entry) => entry.status === "uploading");
  await Promise.all(
    interrupted.map((entry) =>
      putRecord(UPLOAD_STORE, {
        ...entry,
        status: "retry_pending",
        updatedAt: new Date().toISOString(),
        lastError: {
          code: "upload_interrupted",
          message: "The previous upload attempt was interrupted.",
        },
      }),
    ),
  );
}

async function findExistingUpload(captureId, idempotencyKey) {
  const byCapture = await getRecord(UPLOAD_STORE, captureId);
  if (byCapture) return byCapture;
  const database = await openDatabase();
  return transactionResult(database, UPLOAD_STORE, "readonly", (store) =>
    requestResult(store.index("idempotencyKey").get(idempotencyKey)),
  );
}

function restoreFile(entry) {
  const options = {
    type: entry.mimeType || entry.blob?.type || "application/octet-stream",
    lastModified: Number(entry.lastModified || Date.parse(entry.occurredAt) || Date.now()),
  };
  return new File([entry.blob], entry.filename, options);
}

function toPublicEntry(entry, includeBlob) {
  const publicEntry = {
    queueId: entry.queueId,
    captureId: entry.captureId,
    idempotencyKey: entry.idempotencyKey,
    occurredAt: entry.occurredAt,
    filename: entry.filename,
    mimeType: entry.mimeType,
    sizeBytes: entry.sizeBytes,
    lastModified: entry.lastModified,
    participantId: entry.participantId,
    caption: entry.caption,
    metadata: cloneSerializable(entry.metadata || {}),
    source: cloneSerializable(entry.source || {}),
    status: entry.status,
    attempts: entry.attempts,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    lastAttemptAt: entry.lastAttemptAt,
    lastError: entry.lastError ? { ...entry.lastError } : null,
  };
  if (includeBlob) publicEntry.blob = entry.blob;
  return publicEntry;
}

function normalizeOccurredAt(value, lastModified) {
  const candidate = value || lastModified || Date.now();
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) throw new Error("upload_queue_occurred_at_invalid");
  return date.toISOString();
}

function cloneSerializable(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function serializeError(error) {
  return {
    code: String(error?.code || error?.name || "upload_failed"),
    message: String(error?.message || error || "Upload failed"),
  };
}

function assertBlob(file) {
  if (typeof Blob === "undefined" || !(file instanceof Blob)) {
    throw new TypeError("upload_queue_file_required");
  }
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexeddb_unavailable"));
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(UPLOAD_STORE)) {
        const uploads = database.createObjectStore(UPLOAD_STORE, {
          keyPath: "queueId",
        });
        uploads.createIndex("idempotencyKey", "idempotencyKey", {
          unique: true,
        });
        uploads.createIndex("status", "status", { unique: false });
        uploads.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(CHECKPOINT_STORE)) {
        database.createObjectStore(CHECKPOINT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error("indexeddb_open_failed"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("indexeddb_upgrade_blocked"));
    };
  });
  return databasePromise;
}

async function getRecord(storeName, key) {
  if (!key) return undefined;
  const database = await openDatabase();
  return transactionResult(database, storeName, "readonly", (store) =>
    requestResult(store.get(key)),
  );
}

async function getAllRecords(storeName) {
  const database = await openDatabase();
  return transactionResult(database, storeName, "readonly", (store) =>
    requestResult(store.getAll()),
  );
}

async function putRecord(storeName, value) {
  const database = await openDatabase();
  return transactionResult(database, storeName, "readwrite", (store) =>
    requestResult(store.put(value)),
  );
}

async function deleteRecord(storeName, key) {
  const database = await openDatabase();
  return transactionResult(database, storeName, "readwrite", (store) =>
    requestResult(store.delete(key)),
  );
}

function transactionResult(database, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let operationResult;
    Promise.resolve()
      .then(() => operation(store))
      .then((result) => {
        operationResult = result;
      })
      .catch((error) => {
        try {
          transaction.abort();
        } catch {}
        reject(error);
      });
    transaction.oncomplete = () => resolve(operationResult);
    transaction.onerror = () =>
      reject(transaction.error || new Error("indexeddb_transaction_failed"));
    transaction.onabort = () =>
      reject(transaction.error || new Error("indexeddb_transaction_aborted"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("indexeddb_request_failed"));
  });
}

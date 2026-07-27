export function createCaptureMemoryAdapters() {
  const operationRows = new Map();
  const catalogRows = new Map();
  const objects = new Map();
  const failures = {
    storagePut: 0,
    catalogUpsert: 0,
  };

  const operations = {
    async claim(seed) {
      if (!operationRows.has(seed.operationId)) operationRows.set(seed.operationId, structuredClone(seed));
      return structuredClone(operationRows.get(seed.operationId));
    },
    async get(operationId) {
      return cloneOrNull(operationRows.get(operationId));
    },
    async save(operation) {
      operationRows.set(operation.operationId, structuredClone(operation));
      return structuredClone(operation);
    },
  };

  const storage = {
    async exists(storagePath) {
      return objects.has(storagePath);
    },
    async put(storagePath, bytes, metadata = {}) {
      if (failures.storagePut > 0) {
        failures.storagePut -= 1;
        throw new Error("simulated_storage_failure");
      }
      objects.set(storagePath, {
        bytes: Buffer.from(bytes),
        metadata: structuredClone(metadata),
      });
    },
  };

  const catalog = {
    async get(captureId) {
      return cloneOrNull(catalogRows.get(captureId));
    },
    async upsert(record) {
      if (failures.catalogUpsert > 0) {
        failures.catalogUpsert -= 1;
        throw new Error("simulated_catalog_failure");
      }
      catalogRows.set(record.captureId, structuredClone(record));
      return structuredClone(record);
    },
  };

  return {
    operations,
    storage,
    catalog,
    inspect: {
      operations: operationRows,
      catalog: catalogRows,
      objects,
    },
    failNext(stage, count = 1) {
      if (!(stage in failures)) throw new Error(`unknown_failure_stage:${stage}`);
      failures[stage] += count;
    },
  };
}

function cloneOrNull(value) {
  return value == null ? null : structuredClone(value);
}

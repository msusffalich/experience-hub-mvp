const now = new Date().toISOString();

const asset = {
  assetId: `asset-${Date.now()}`,
  experienceId: "exp-lab",
  eventId: "evt-lab-1",
  participantId: "participant-lab",
  kind: "image",
  mimeType: "image/png",
  sizeBytes: 68,
  storageBucket: "experience-media",
  storagePath: "",
  uploadStatus: "pending",
  uploadError: "",
  processingStatus: "pending",
  sourceDevice: "lab-device",
  capturedAt: now,
  metadataFingerprint: "lab-fingerprint",
};

const attempts = [];
const jobs = [];

function recordAttempt(status, patch = {}) {
  const attempt = {
    attemptId: `attempt-${attempts.length + 1}`,
    assetId: asset.assetId,
    experienceId: asset.experienceId,
    fileName: "lab.png",
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    status,
    startedAt: now,
    finishedAt: status === "uploading" ? "" : new Date().toISOString(),
    ...patch,
  };
  attempts.push(attempt);
  return attempt;
}

function enqueueProcessingJob(jobType) {
  const job = {
    jobId: `job-${jobs.length + 1}`,
    assetId: asset.assetId,
    experienceId: asset.experienceId,
    jobType,
    status: "pending",
    progress: {},
    result: {},
    errorCode: "",
    errorMessage: "",
    createdAt: new Date().toISOString(),
  };
  jobs.push(job);
  return job;
}

recordAttempt("uploading");
recordAttempt("failed", {
  errorCode: "storage_401",
  errorMessage: "Secret key was sent with the wrong Authorization mode.",
});

asset.uploadStatus = "failed";
asset.uploadError = attempts.at(-1).errorMessage;
asset.processingStatus = "blocked_until_upload";

const retry = recordAttempt("uploaded", {
  storagePath: "user-id/lab.png",
});
asset.uploadStatus = "uploaded";
asset.uploadError = "";
asset.storagePath = retry.storagePath;
asset.processingStatus = "pending";

enqueueProcessingJob("image_description");

console.log(JSON.stringify({ asset, attempts, jobs }, null, 2));

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVER_KEY = process.env.SUPABASE_SERVER_KEY || "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "experience-media";

if (!SUPABASE_URL || !SUPABASE_SERVER_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVER_KEY.");
  process.exit(2);
}

const objectPath = `clio-lab/${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;
const bytes = new TextEncoder().encode(`Experience Hub CLIO lab ${new Date().toISOString()}`);

function isLegacyJwtKey(key = "") {
  return key.split(".").length === 3;
}

function serverHeaders(extra = {}) {
  const headers = {
    apikey: SUPABASE_SERVER_KEY,
    ...extra,
  };
  if (isLegacyJwtKey(SUPABASE_SERVER_KEY)) {
    headers.Authorization = `Bearer ${SUPABASE_SERVER_KEY}`;
  }
  return headers;
}

async function request(label, url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed ${response.status}: ${sanitize(text)}`);
  }
  return text ? JSON.parse(text) : null;
}

function sanitize(text = "") {
  return text
    .replaceAll(SUPABASE_SERVER_KEY, "[server-key]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[token]")
    .slice(0, 500);
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`Storage smoke started: ${startedAt}`);
  console.log(`Bucket: ${SUPABASE_BUCKET}`);
  console.log(`Object: ${objectPath}`);

  await request("bucket", `${SUPABASE_URL}/storage/v1/bucket/${SUPABASE_BUCKET}`, {
    headers: serverHeaders(),
  });

  await request("upload", `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`, {
    method: "POST",
    headers: serverHeaders({
      "Content-Type": "text/plain; charset=utf-8",
      "x-upsert": "true",
    }),
    body: bytes,
  });

  const signed = await request("sign", `${SUPABASE_URL}/storage/v1/object/sign/${SUPABASE_BUCKET}/${objectPath}`, {
    method: "POST",
    headers: serverHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: 60 }),
  });

  const signedUrl = `${SUPABASE_URL}/storage/v1${signed.signedURL}`;
  const signedResponse = await fetch(signedUrl);
  if (!signedResponse.ok) {
    throw new Error(`signed URL failed ${signedResponse.status}: ${sanitize(await signedResponse.text())}`);
  }

  await request("delete", `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}`, {
    method: "DELETE",
    headers: serverHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: [objectPath] }),
  });

  console.log("Storage smoke passed.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

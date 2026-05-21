const requiredForStorage = ["SUPABASE_URL", "SUPABASE_SERVER_KEY", "SUPABASE_BUCKET"];

const present = requiredForStorage.filter((key) => Boolean(process.env[key]));
const missing = requiredForStorage.filter((key) => !process.env[key]);

console.log("CLIO patterns lab environment");
console.log(`Present: ${present.length ? present.join(", ") : "none"}`);
console.log(`Missing for storage smoke: ${missing.length ? missing.join(", ") : "none"}`);

if (process.env.SUPABASE_SERVER_KEY?.startsWith("sb_secret_")) {
  console.log("Detected current Supabase secret key format.");
} else if ((process.env.SUPABASE_SERVER_KEY || "").split(".").length === 3) {
  console.log("Detected legacy JWT service_role key format.");
} else if (process.env.SUPABASE_SERVER_KEY) {
  console.log("Detected unknown server key format; storage smoke will report the real API response.");
}

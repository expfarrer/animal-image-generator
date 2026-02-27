// app/scripts/list-models.mjs
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const key = process.env.OPENAI_API_KEY;

if (!key) {
  console.error("Missing OPENAI_API_KEY in env.");
  process.exit(1);
}

const res = await fetch("https://api.openai.com/v1/models", {
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
});

if (!res.ok) {
  const txt = await res.text();
  console.error("Failed:", res.status, txt);
  process.exit(1);
}

const json = await res.json();
const ids = (json.data || []).map((m) => m.id).sort();

const imageLikely = ids.filter((id) => /(dall-e|image|vision)/i.test(id));

console.log(`Total models visible to this key: ${ids.length}`);
console.log("\nLikely image models:");
for (const id of imageLikely) console.log(" -", id);

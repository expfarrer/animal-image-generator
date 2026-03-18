// app/utils/downloadFilename.ts
//
// Generates safe, human-readable download filenames for generated images.
//
// Confidence ladder (MobileNet top-1 prediction):
//   >= 0.90  → breed / most-specific label  (e.g. "pug-2026-03-17-2142.jpg")
//   >= 0.75  → generic species              (e.g. "dog-2026-03-17-2142.jpg")
//   < 0.75   → safe fallback               (e.g. "aig-image-2026-03-17-2142.jpg")
//
// Filenames are always:
//   - lowercase kebab-case
//   - free of special / unsafe characters
//   - ≤ ~50 characters (label capped at 30 chars)
//   - timestamped as YYYY-MM-DD-HHmm (no colons, filesystem-safe)
//   - extension derived from actual output mime type

// Maps ImageNet label fragments → generic species name.
// Order matters: more-specific entries must appear before broader ones
// so that "golden retriever" maps to "dog", not something unexpected.
const SPECIES_MAP: [string, string][] = [
  // Dog breeds → dog
  ["retriever", "dog"], ["setter", "dog"], ["pointer", "dog"], ["spaniel", "dog"],
  ["terrier", "dog"], ["hound", "dog"], ["shepherd", "dog"], ["poodle", "dog"],
  ["beagle", "dog"], ["bulldog", "dog"], ["collie", "dog"], ["husky", "dog"],
  ["malamute", "dog"], ["samoyed", "dog"], ["boxer", "dog"], ["dalmatian", "dog"],
  ["chihuahua", "dog"], ["dachshund", "dog"], ["greyhound", "dog"], ["whippet", "dog"],
  ["schnauzer", "dog"], ["akita", "dog"], ["corgi", "dog"], ["shiba", "dog"],
  ["borzoi", "dog"], ["saluki", "dog"], ["wolfhound", "dog"], ["deerhound", "dog"],
  ["leonberg", "dog"], ["newfoundland", "dog"], ["briard", "dog"],
  ["affenpinscher", "dog"], ["pekinese", "dog"], ["papillon", "dog"],
  ["maltese", "dog"], ["shih", "dog"], ["lhasa", "dog"], ["chow", "dog"],
  ["keeshond", "dog"], ["pomeranian", "dog"],
  // Cat breeds → cat
  ["tabby", "cat"], ["persian", "cat"], ["siamese", "cat"], ["burmese", "cat"],
  ["manx", "cat"], ["angora", "cat"], ["egyptian", "cat"],
  // Parrots → parrot
  ["macaw", "parrot"], ["lorikeet", "parrot"], ["cockatoo", "parrot"],
  // Birds → bird
  ["finch", "bird"], ["jay", "bird"], ["robin", "bird"], ["sparrow", "bird"],
  ["eagle", "bird"], ["hawk", "bird"], ["falcon", "bird"], ["vulture", "bird"],
  ["owl", "bird"], ["flamingo", "bird"], ["pelican", "bird"], ["stork", "bird"],
  ["heron", "bird"], ["crane", "bird"], ["duck", "bird"], ["goose", "bird"],
  ["swan", "bird"], ["toucan", "bird"], ["peacock", "bird"], ["penguin", "bird"],
  ["ostrich", "bird"], ["hen", "bird"], ["pigeon", "bird"], ["dove", "bird"],
  ["brambling", "bird"], ["goldfinch", "bird"], ["junco", "bird"], ["bunting", "bird"],
  ["bulbul", "bird"], ["chickadee", "bird"], ["albatross", "bird"], ["quail", "bird"],
  // Snakes → snake
  ["python", "snake"], ["boa", "snake"], ["cobra", "snake"], ["viper", "snake"],
  ["rattlesnake", "snake"],
  // Reptiles
  ["gecko", "lizard"], ["iguana", "lizard"], ["chameleon", "lizard"], ["skink", "lizard"],
  ["alligator", "alligator"], ["crocodile", "crocodile"],
  ["turtle", "turtle"], ["tortoise", "tortoise"],
  // Amphibians
  ["toad", "frog"], ["salamander", "salamander"], ["newt", "newt"],
  // Fish
  ["salmon", "fish"], ["goldfish", "fish"], ["tench", "fish"], ["eel", "fish"],
  // Broad species (must come after breed-level entries above)
  ["dog", "dog"], ["cat", "cat"], ["bird", "bird"], ["fish", "fish"],
  ["frog", "frog"], ["snake", "snake"], ["bear", "bear"], ["wolf", "wolf"],
  ["lion", "lion"], ["tiger", "tiger"], ["leopard", "leopard"],
  ["cheetah", "cheetah"], ["jaguar", "jaguar"], ["panda", "panda"],
  ["koala", "koala"], ["kangaroo", "kangaroo"], ["elephant", "elephant"],
  ["rabbit", "rabbit"], ["hamster", "hamster"], ["squirrel", "squirrel"],
  ["chipmunk", "squirrel"], ["fox", "fox"], ["whale", "whale"],
  ["shark", "shark"], ["dolphin", "dolphin"], ["seal", "seal"],
  ["horse", "horse"], ["sheep", "sheep"], ["cow", "cow"], ["pig", "pig"],
  ["goat", "goat"], ["monkey", "monkey"], ["mouse", "mouse"], ["rat", "rat"],
  ["otter", "otter"], ["meerkat", "meerkat"], ["hedgehog", "hedgehog"],
  ["bat", "bat"], ["sloth", "sloth"], ["llama", "llama"], ["camel", "camel"],
  ["giraffe", "giraffe"], ["zebra", "zebra"], ["gorilla", "gorilla"],
];

/** Sanitize a raw label segment to lowercase kebab-case, max 30 chars. */
function sanitizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** Format a date as YYYY-MM-DD-HHmm (no colons, filesystem-safe). */
function formatTimestamp(now: Date): string {
  const y  = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d  = String(now.getDate()).padStart(2, "0");
  const h  = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d}-${h}${mi}`;
}

/** Derive file extension from a mime type string. */
function extFromMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("png"))  return ".png";
  if (mime.includes("webp")) return ".webp";
  return ".jpg"; // gpt-image-1 default
}

/**
 * Parse the mime type from a result URL.
 * Handles data URLs (`data:image/png;base64,...`) and HTTP URLs.
 * gpt-image-1 HTTP URLs default to PNG.
 */
export function resultMimeFromUrl(url: string): string {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;,]+)/);
    if (m) return m[1];
  }
  // For HTTP URLs from gpt-image-1, the output is always PNG
  return "image/png";
}

/**
 * Build a safe, descriptive download filename.
 *
 * @param predictions  MobileNet top-N predictions, sorted by probability desc (may be null)
 * @param resultMime   Mime type of the generated image — use resultMimeFromUrl() to get this
 * @param now          Date override for testing (defaults to current time)
 */
export function buildDownloadFilename(
  predictions: { className: string; probability: number }[] | null,
  resultMime: string,
  now = new Date(),
): string {
  const ts  = formatTimestamp(now);
  const ext = extFromMime(resultMime);

  if (predictions && predictions.length > 0) {
    const top        = predictions[0];
    const confidence = top.probability;
    const rawLabel   = top.className; // e.g. "pug" | "golden retriever" | "tabby, tabby cat"

    if (confidence >= 0.90) {
      // High confidence: use the most-specific label segment (first comma-delimited part)
      const specific = sanitizeLabel(rawLabel.split(",")[0]);
      if (specific && specific.length > 1) {
        return `${specific}-${ts}${ext}`;
      }
    }

    if (confidence >= 0.75) {
      // Mid confidence: map to generic species so we never mis-name a breed
      const lower = rawLabel.toLowerCase();
      for (const [keyword, species] of SPECIES_MAP) {
        if (lower.includes(keyword)) {
          return `${species}-${ts}${ext}`;
        }
      }
      // No species match — fall back to sanitized label rather than generic fallback
      const specific = sanitizeLabel(rawLabel.split(",")[0]);
      if (specific && specific.length > 1) {
        return `${specific}-${ts}${ext}`;
      }
    }
  }

  return `aig-image-${ts}${ext}`;
}

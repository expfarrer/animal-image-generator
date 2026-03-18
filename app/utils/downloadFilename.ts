// app/utils/downloadFilename.ts
//
// Generates safe, human-readable download filenames for generated images.
//
// Naming logic (MobileNet top-1 prediction):
//   1. Always try SPECIES_MAP first (safer — avoids overconfident breed mislabels)
//   2. If no species match AND confidence >= 0.90 AND label is short/simple:
//      → use sanitized breed label
//   3. Otherwise → "aig-image" fallback
//
// All filenames are:
//   - lowercase kebab-case
//   - free of special / unsafe characters
//   - timestamped as YYYY-MM-DD-HHmm (filesystem-safe, no colons)
//   - extension derived from actual output mime type

// Maps ImageNet label fragments → generic species name.
// Order matters: more-specific entries must appear before broader ones.
// Applied first at any confidence >= 0.75 — species is always preferred over breed.
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
  // Common breeds frequently misclassified — map to species to prevent confident mislabels
  ["pug", "dog"], ["vizsla", "dog"], ["weimaraner", "dog"],
  ["doberman", "dog"], ["rottweiler", "dog"],
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

/**
 * True if a label segment is short and plain enough to use as a filename.
 * Rejects multi-word (>2) and long (>25 char) labels that would be confusing
 * or risk obscure/technical ImageNet terminology reaching users.
 */
function isReadableBreedLabel(segment: string): boolean {
  if (segment.length > 25) return false;
  return segment.trim().split(/\s+/).length <= 2;
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
  return ".jpg"; // safe fallback
}

/**
 * Parse the mime type from a result URL.
 * Handles data URLs (`data:image/png;base64,...`) and HTTP URLs.
 */
export function resultMimeFromUrl(url: string): string {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;,]+)/);
    if (m) return m[1];
  }
  // gpt-image-1 currently returns PNG for all URL-format responses (non-b64_json path).
  // If the API adds JPEG or WebP output options, update this fallback accordingly.
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
    const top          = predictions[0];
    const confidence   = top.probability;
    // Use the first comma-delimited segment — the most specific part of the ImageNet label.
    // e.g. "tabby, tabby cat" → "tabby" | "golden retriever" → "golden retriever"
    const firstSegment = top.className.split(",")[0].trim();
    const lower        = firstSegment.toLowerCase();

    if (confidence >= 0.75) {
      // Step 1: Always prefer a species-level name from SPECIES_MAP.
      // This is safer than breed: avoids confident mislabels (pug vs french bulldog, etc.)
      // and produces clearer filenames for end users.
      for (const [keyword, species] of SPECIES_MAP) {
        if (lower.includes(keyword)) {
          return `${species}-${ts}${ext}`;
        }
      }

      // Step 2: No species match — only use breed label at high confidence
      // and only if the label is short and human-readable.
      // Rejects multi-word technical labels and obscure ImageNet terms.
      if (confidence >= 0.90 && isReadableBreedLabel(firstSegment)) {
        const specific = sanitizeLabel(firstSegment);
        if (specific && specific.length > 1) {
          return `${specific}-${ts}${ext}`;
        }
      }
    }
  }

  return `aig-image-${ts}${ext}`;
}

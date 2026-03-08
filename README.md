# Animal Image Generator — v3.0

A mobile-first web application that turns a pet photo into a themed AI-generated image. Upload an animal photo, pick a theme, add optional keywords, and get a styled image back in seconds — powered by OpenAI's `gpt-image-1`.

---

## How it works

1. **Upload** a photo — client-side MobileNet classifier checks it's actually an animal before sending anything to the server.
2. **Pick a theme** — Celebration, Memorial, Retirement, Fantasy, or Keywords-only (your keywords become the full prompt, no template added).
3. **Add keywords** (optional) — short descriptors woven into the prompt.
4. **Choose a size** — Square (1024×1024), Portrait (1024×1536), or Landscape (1536×1024).
5. **Generate** — the image is edited via `gpt-image-1 /images/edits`. If the model returns the same image it was given, a fallback text-only generation is offered automatically.

---

## Stack

| Layer               | Technology                                 |
| ------------------- | ------------------------------------------ |
| Framework           | Next.js 16 (App Router)                    |
| Language            | TypeScript                                 |
| Styling             | Tailwind CSS v4                            |
| State               | Redux Toolkit                              |
| AI — image          | OpenAI gpt-image-1                         |
| AI — moderation     | OpenAI omni-moderation-latest              |
| AI — classification | TensorFlow.js / MobileNet v2 (client-side) |

---

## Project structure

```
app/
  api/
    generate-image/   # Core image generation route (POST)
    stats/            # Live rate-limiter stats (GET)
  components/
    ImageGeneratorForm.tsx   # Main UI component
    Toaster.tsx              # Toast notification system
  features/
    imageSlice.ts     # Redux slice — image state
    modelSlice.ts     # Redux slice — MobileNet status
  lib/
    rateLimit.ts      # Shared in-memory rate limiter singleton
  utils/
    resizeImage.ts    # Client-side image resize before upload
  layout.tsx
  page.tsx
  store.ts
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `.env.local` in the project root:

```env
OPENAI_API_KEY=sk-...

# Optional — MobileNet animal classifier (recommended)
NEXT_PUBLIC_MOBILENET=true

# Optional — rate limiting (defaults shown)
# RATE_LIMIT_MAX=10
# RATE_LIMIT_WINDOW_SEC=60
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Configuration

| Env var                 | Default | Description                                                                                                    |
| ----------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`        | —       | Required. Your OpenAI API key.                                                                                 |
| `NEXT_PUBLIC_MOBILENET` | `false` | Enables client-side animal classifier. Recommended — prevents non-animal uploads before they reach the server. |
| `RATE_LIMIT_MAX`        | `10`    | Max requests per IP per window.                                                                                |
| `RATE_LIMIT_WINDOW_SEC` | `60`    | Rate limit window in seconds.                                                                                  |

---

## Safety & guardrails

- **Client-side classifier** — MobileNet rejects non-animal images before upload (fails open on classifier error).
- **Profanity filter** — whole-word regex matching on the keywords field. Substring false positives (e.g. "sunglasses") are avoided.
- **Server-side moderation** — OpenAI `omni-moderation-latest` screens both the uploaded image and caption before generation.
- **Rate limiting** — fixed-window per-IP limiter (in-memory, single-instance).
- **Session cap** — client-side limit of 10 generations per tab session.
- **Image size cap** — 5 MB max upload, resized client-side to 1024px before sending.

---

## Quality

Generation quality is locked to **medium** for the current POC build ($0.07/image with gpt-image-1). The full Low / Medium / High selector is preserved in code and ready to restore for v1 launch.

---

## Stats

A live server stats page is available at [/stats](http://localhost:3000/stats). Shows active IPs, request counts in the current rate-limit window, and blocked IPs. Auto-refreshes every 10 seconds.

---

## Themes

| Theme         | Behaviour                                                    |
| ------------- | ------------------------------------------------------------ |
| Celebration   | Festive scene with confetti and a banner using your keywords |
| Memorial      | Soft-toned portrait with gentle light and floral elements    |
| Retirement    | Party hat, small cake, warm whimsical tones                  |
| Fantasy       | Glowing wings, magical light, painterly style                |
| Keywords only | Your keywords become the entire prompt — no template added   |

---

## Version history

| Version | Notes                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.0     | Size selector, Keywords-only theme, profanity filter fix (whole-word), stats page, timer fix, session counter hydration fix, rate limit env vars, prompt display |
| 2.9     | Quality UI hidden (locked to medium), size wired end-to-end                                                                                                      |
| 2.3     | Core generation flow, moderation, MobileNet classifier, rate limiting, session cap                                                                               |

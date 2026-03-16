// app/page.tsx — Landing page
// Ad traffic arrives here. One job: explain the product and send users to /pricing or /generator.

import LandingCTA from "./components/LandingCTA";

// ── Trust items ─────────────────────────────────────────────────────────────
const TRUST = [
  "No signup required",
  "Instant download",
  "One-time purchase",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="w-full max-w-lg px-4 pt-6 pb-6 text-center">
        <h1 className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-3">
          Animal Image Generator
        </h1>
        <h2 className="text-3xl font-bold text-slate-900 leading-tight">
          Turn Your Pet Into Amazing Art
        </h2>
        <p className="text-slate-500 mt-3 text-base leading-relaxed">
          Upload a pet photo, choose a fun theme, and create your custom image.
        </p>
      </section>

      {/* ── Example visual ─────────────────────────────────────────────────── */}
      <section className="w-full max-w-lg px-4 pb-6">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <img
            src="/progress.jpg"
            alt="Example pet image transformation"
            className="mx-auto max-w-full h-auto rounded-xl object-contain"
          />
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="w-full max-w-lg px-4 pb-6">
        <div className="bg-white rounded-2xl shadow-sm px-6 py-4 text-center">
          <p className="text-sm text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-700">1. Upload</span> a pet photo
            &nbsp;·&nbsp;
            <span className="font-semibold text-slate-700">2. Choose</span> a theme
            &nbsp;·&nbsp;
            <span className="font-semibold text-slate-700">3. Download</span>
          </p>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="w-full max-w-lg px-4 pb-4">
        <LandingCTA />
      </section>

      {/* ── Trust row ──────────────────────────────────────────────────────── */}
      <section className="pb-10 flex flex-col gap-1.5 items-center">
        {TRUST.map((item) => (
          <div key={item} className="flex items-center gap-1.5 text-sm text-slate-500">
            <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {item}
          </div>
        ))}
      </section>

    </div>
  );
}

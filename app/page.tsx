// app/page.tsx — Landing page
// Ad traffic arrives here. One job: explain the product and send users to /pricing.

import Link from "next/link";

// ── Step explainer ─────────────────────────────────────────────────────────
const STEPS = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12V4m0 0L8 8m4-4l4 4" />
      </svg>
    ),
    label: "Upload a photo",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
    label: "Pick a theme",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
      </svg>
    ),
    label: "Generate",
  },
];

// ── Trust items ─────────────────────────────────────────────────────────────
const TRUST = [
  "No signup required",
  "Instant download",
  "One-time purchase",
];

// ── Theme pills ─────────────────────────────────────────────────────────────
const THEMES = ["Celebration", "Memorial", "Retirement", "Fantasy"];


export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="w-full max-w-lg px-4 pt-14 pb-6 text-center">
        <h1 className="text-3xl font-bold text-slate-900 leading-tight">
          Turn Your Pet<br />Into Amazing Art
        </h1>
        <p className="text-slate-500 mt-3 text-base leading-relaxed">
          Upload a photo, pick a theme, and create beautiful<br className="hidden sm:inline" />
          animal images in seconds.
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

      {/* ── 3-step explainer ───────────────────────────────────────────────── */}
      <section className="w-full max-w-lg px-4 pb-6">
        <div className="bg-white rounded-2xl shadow-sm p-4 flex justify-around">
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <div className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  {step.icon}
                </div>
                <span className="text-xs font-medium text-slate-600 max-w-[64px] leading-tight">
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <svg className="w-3 h-3 text-slate-300 flex-shrink-0 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Theme pills ────────────────────────────────────────────────────── */}
      <section className="w-full max-w-lg px-4 pb-6">
        <div className="flex gap-2 flex-wrap justify-center">
          {THEMES.map((t) => (
            <span
              key={t}
              className="px-4 py-2 bg-white rounded-full text-sm font-medium text-slate-600 shadow-sm"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="w-full max-w-lg px-4 pb-4">
        <Link
          href="/pricing"
          className="block w-full py-4 bg-indigo-600 text-white text-base font-semibold rounded-2xl text-center active:bg-indigo-700"
        >
          Start Creating
        </Link>
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

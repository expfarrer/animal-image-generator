// app/components/PageHeader.tsx
// Standardised H1 → H2 → P header block used on every full-page layout.
// Drop this inside each page's <header> wrapper; the wrapper controls padding/bg.

interface Props {
  headline: string;
  description: string;
}

export default function PageHeader({ headline, description }: Props) {
  return (
    <>
      <h1 className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-1">
        Animal Image Generator
      </h1>
      <h2 className="text-2xl font-bold text-slate-900">{headline}</h2>
      <p className="text-sm text-slate-500 mt-1">{description}</p>
    </>
  );
}

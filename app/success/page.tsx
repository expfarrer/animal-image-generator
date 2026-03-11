// app/success/page.tsx
// Shown after a successful Stripe checkout.
// Reads session_id from the query string, fetches the session from Stripe,
// and displays a confirmation with the credits that were purchased.

import { stripe, priceIdToCredits } from "../lib/stripe";
import Link from "next/link";
import CreditInitializer from "./CreditInitializer";

interface Props {
  searchParams: Promise<{ session_id?: string }>;
}

export default async function SuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;

  if (!session_id) {
    return <ErrorState message="No session ID found. Did you arrive here directly?" />;
  }

  let email: string | null = null;
  let credits: number | null = null;

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items"],
    });

    email = session.customer_details?.email ?? session.customer_email ?? null;

    const priceId = session.line_items?.data[0]?.price?.id ?? null;
    credits = priceId ? priceIdToCredits(priceId) : null;
  } catch (err) {
    console.error("[success] failed to retrieve session:", err);
    return <ErrorState message="Could not verify your order details. If payment was completed, please contact support using your order email." />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center flex flex-col gap-4">
        {/* Checkmark */}
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h1 className="text-xl font-bold text-slate-900">Payment confirmed!</h1>
          {email && (
            <p className="text-sm text-slate-500 mt-1">Receipt sent to {email}</p>
          )}
        </div>

        {credits !== null && (
          <div className="bg-indigo-50 rounded-xl px-4 py-3">
            <p className="text-3xl font-bold text-indigo-600">{credits}</p>
            <p className="text-sm text-slate-600 mt-0.5">image credits added to your account</p>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Credits are ready to use. Each generation uses 1 credit.
        </p>

        {/* Stores credits in localStorage so the generator can show the counter */}
        {credits !== null && <CreditInitializer credits={credits} sessionId={session_id} />}

        <Link
          href="/generator"
          className="w-full py-3.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl text-center"
        >
          Start generating →
        </Link>

        <Link href="/pricing" className="text-xs text-slate-400 underline underline-offset-2">
          Buy more credits
        </Link>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center flex flex-col gap-4">
        <p className="text-sm text-slate-600">{message}</p>
        <Link href="/" className="text-sm text-indigo-600 underline underline-offset-2">
          Back to generator
        </Link>
      </div>
    </div>
  );
}

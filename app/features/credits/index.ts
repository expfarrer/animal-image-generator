// app/features/credits/index.ts
// Barrel export — import everything credits-related from here.

export { getCredits, setCredits, incrementCredits, deductCredit } from "./lib/credits";
export { requireCredits } from "./middleware/requireCredits";
export type { CreditBalance, DeductResult } from "./types";

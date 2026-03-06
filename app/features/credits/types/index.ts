// app/features/credits/types/index.ts

export interface CreditBalance {
  email: string;
  credits: number;
}

export interface DeductResult {
  success: boolean;
  remaining: number;
}

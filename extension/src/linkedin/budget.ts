/*
 * A hard daily limit on requests to LinkedIn, and a full day's pause the
 * moment LinkedIn pushes back. Reading too much got an account restricted;
 * past the limit nothing goes to LinkedIn until tomorrow, sends included.
 */
export const DAILY_LIMIT = 200;
const PUSHBACK_PAUSE_MS = 24 * 60 * 60 * 1000;

export class HoldError extends Error {
  constructor(
    message: string,
    public until: number,
  ) {
    super(message);
  }
}

interface Budget {
  day: string;
  used: number;
  /** After pushback, nothing until this time. */
  holdUntil?: number;
}

const today = () => new Date().toDateString();

export async function getBudget(): Promise<Budget> {
  const { budget } = (await chrome.storage.local.get("budget")) as { budget?: Budget };
  const day = today();
  return budget?.day === day ? budget : { day, used: 0, holdUntil: budget?.holdUntil };
}

function tomorrow(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Throws HoldError when LinkedIn pushed back lately or today's limit is used up; otherwise counts one request. */
export async function spend(): Promise<void> {
  const budget = await getBudget();
  if ((budget.holdUntil ?? 0) > Date.now()) {
    throw new HoldError("LinkedIn asked the helper to slow down, so it is resting for a day.", budget.holdUntil!);
  }
  if (budget.used >= DAILY_LIMIT) {
    throw new HoldError(`The helper made its ${DAILY_LIMIT} LinkedIn requests for today. It picks up again tomorrow.`, tomorrow());
  }
  await chrome.storage.local.set({ budget: { ...budget, used: budget.used + 1, holdUntil: undefined } });
}

export async function holdForADay(): Promise<void> {
  const budget = await getBudget();
  await chrome.storage.local.set({ budget: { ...budget, holdUntil: Date.now() + PUSHBACK_PAUSE_MS } });
}

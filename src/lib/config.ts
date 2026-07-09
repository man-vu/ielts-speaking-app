export const UNIT_COSTS = { full: 3, part1: 1, part2: 1, part3: 1, chat: 1 } as const;
export const PART2_PREP_SECONDS = 60;
export const PART2_TALK_SECONDS = 120;

/** Dev-only: when set (EXPO_PUBLIC_LOCAL_SCORER_URL, e.g. http://192.168.2.15:8000),
 *  the exam scores on a local PC server over LAN instead of the cloud — free,
 *  no units. Empty in normal builds → no behaviour change. */
export const LOCAL_SCORER_URL = process.env.EXPO_PUBLIC_LOCAL_SCORER_URL ?? "";

/** Monthly sim units per tier (null = unlimited) — display only; the server enforces. */
export const SIM_MONTHLY_UNITS: Record<string, number | null> = {
  free: 0,
  standard: 0,
  ai_plus: 12,
  ai_pro: 36,
  admin: null,
};

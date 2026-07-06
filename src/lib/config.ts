export const UNIT_COSTS = { full: 3, part1: 1, part2: 1, part3: 1 } as const;
export const PART2_PREP_SECONDS = 60;
export const PART2_TALK_SECONDS = 120;

/** Monthly sim units per tier (null = unlimited) — display only; the server enforces. */
export const SIM_MONTHLY_UNITS: Record<string, number | null> = {
  free: 0,
  standard: 0,
  ai_plus: 12,
  ai_pro: 36,
  admin: null,
};

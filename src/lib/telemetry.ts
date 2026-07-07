import * as Sentry from "@sentry/react-native";
import { supabase } from "./supabase";

/** First-party analytics + env-gated crash reporting.
 *
 *  track() writes fire-and-forget rows to our own sim_events table (RLS:
 *  users own their rows) — no third-party analytics vendor. Crash reporting
 *  activates only when EXPO_PUBLIC_SENTRY_DSN is set; without it every crash
 *  hook is a no-op, so the wiring ships dormant and turning it on later is
 *  an env change, not a code change. */

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initCrashReporting(): void {
  if (!SENTRY_DSN) return;
  Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.2 });
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function track(event: string, props: Record<string, unknown> = {}): void {
  void (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("sim_events").insert({ user_id: user.id, event, props });
  })().catch(() => {});
}

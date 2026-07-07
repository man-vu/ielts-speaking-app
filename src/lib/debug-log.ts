import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

/** Black-box flight recorder. Breadcrumbs persist to AsyncStorage as they
 *  happen; on the NEXT launch the previous session's trail uploads to our
 *  sim_events table (event "client_log_flush"). A native crash can't give a
 *  JS stack, but the last crumb says exactly where the app died — and a JS
 *  fatal records its full stack via the global handler below. */

const KEY = "debug-crumbs-v1";
const MAX = 120;

interface Crumb {
  t: number;
  tag: string;
  data?: Record<string, unknown>;
}

let buffer: Crumb[] = [];
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persist(immediate = false): void {
  if (persistTimer) clearTimeout(persistTimer);
  if (immediate) {
    void AsyncStorage.setItem(KEY, JSON.stringify(buffer)).catch(() => {});
    return;
  }
  persistTimer = setTimeout(() => {
    void AsyncStorage.setItem(KEY, JSON.stringify(buffer)).catch(() => {});
  }, 250);
}

export function logCrumb(tag: string, data?: Record<string, unknown>): void {
  buffer.push({ t: Date.now(), tag, ...(data ? { data } : {}) });
  if (buffer.length > MAX) buffer = buffer.slice(-MAX);
  persist();
}

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsShape {
  getGlobalHandler(): GlobalErrorHandler;
  setGlobalHandler(handler: GlobalErrorHandler): void;
}

/** Hook the RN global error handler so fatal JS errors land in the trail
 *  (persisted immediately — the app is about to die) before default handling. */
export function installCrashCrumbs(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    buffer.push({ t: Date.now(), tag: "js_fatal", data: { message, isFatal } });
    persist(true);
    previous(error, isFatal);
  });
}

/** Uploads the previous session's trail (if any) and starts fresh. Call once
 *  per launch after auth is ready. Never throws. */
export async function flushPreviousSession(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    await AsyncStorage.removeItem(KEY);
    const prev = JSON.parse(raw) as Crumb[];
    if (!Array.isArray(prev) || prev.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("sim_events").insert({
      user_id: user.id,
      event: "client_log_flush",
      props: { crumbs: prev.slice(-MAX) },
    });
  } catch {
    // The recorder must never break the app.
  }
}

import { supabase } from "./supabase";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL!;

/** Authenticated fetch against the web backend. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

import { supabase } from "./supabase";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL!;

/** Authenticated fetch against the web backend. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

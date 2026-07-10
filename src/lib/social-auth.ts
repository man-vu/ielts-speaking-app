import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
} from "@react-native-google-signin/google-signin";
import { supabase } from "./supabase";

// The Supabase project already holds this Google *web* client (shared with
// ielts-pro); it's the audience Supabase validates the ID token against.
const GOOGLE_WEB_CLIENT_ID =
  "230124496406-v1inbjdkqkot85rivmpsg5fk5ld7ijsa.apps.googleusercontent.com";
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

/** Google needs an iOS OAuth client ID to run natively; until one is supplied
 *  the button stays hidden rather than erroring. */
export const googleAuthAvailable = !!GOOGLE_IOS_CLIENT_ID;

/** Thrown-and-swallowed sentinel for a user-cancelled native sheet. */
export class AuthCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "AuthCancelled";
  }
}

let googleConfigured = false;
function configureGoogle() {
  if (googleConfigured || !GOOGLE_IOS_CLIENT_ID) return;
  GoogleSignin.configure({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });
  googleConfigured = true;
}

/** Native Sign in with Apple → Supabase session. iOS only. */
export async function signInWithApple(): Promise<void> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error("Apple did not return an identity token.");
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error) throw error;
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "ERR_REQUEST_CANCELED") {
      throw new AuthCancelled();
    }
    throw e;
  }
}

/** Native Google Sign-In → Supabase session. */
export async function signInWithGoogle(): Promise<void> {
  if (!GOOGLE_IOS_CLIENT_ID) throw new Error("Google sign-in is not configured.");
  configureGoogle();
  try {
    if (Platform.OS === "android") await GoogleSignin.hasPlayServices();
    const result = await GoogleSignin.signIn();
    // v13 returns { type, data }; older returns the user directly.
    const idToken =
      (result as { data?: { idToken?: string } }).data?.idToken ??
      (result as { idToken?: string }).idToken;
    if (!idToken) throw new Error("Google did not return an ID token.");
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });
    if (error) throw error;
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new AuthCancelled();
    }
    throw e;
  }
}

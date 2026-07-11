import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";

/** RevenueCat wrapper. Purchases exist only on iOS builds configured with a
 *  RevenueCat public key (EXPO_PUBLIC_REVENUECAT_IOS_KEY) — sideloaded
 *  Android has no Play Billing, and dev builds without the key keep the
 *  paywall in preview mode. Server truth: RC webhook → profiles.tier. */

const RC_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";

export const PLAN_PRODUCTS = {
  ai_plus: "com.tim.ieltsspeaking.aiplus.monthly",
  ai_pro: "com.tim.ieltsspeaking.aipro.monthly",
} as const;
export type PlanKey = keyof typeof PLAN_PRODUCTS;

let configuredFor: string | null = null;

export function purchasesAvailable(): boolean {
  if (RC_IOS_KEY.length === 0) return false;
  // RevenueCat Test Store keys ("test_…") are DEVELOPMENT-ONLY: the native SDK
  // force-closes the app if a test key is used in a release build, so we must
  // never even configure with one there. They work only in dev builds
  // (__DEV__). A production key ("appl_…") works in iOS release builds.
  if (RC_IOS_KEY.startsWith("test_")) return __DEV__;
  return Platform.OS === "ios";
}

/** Configure (or re-identify) RevenueCat for the signed-in Supabase user.
 *  The Supabase uid is the RC app_user_id — the webhook relies on it. */
export async function configurePurchases(userId: string): Promise<boolean> {
  if (!purchasesAvailable()) return false;
  try {
    if (configuredFor === null) {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
      Purchases.configure({ apiKey: RC_IOS_KEY, appUserID: userId });
    } else if (configuredFor !== userId) {
      await Purchases.logIn(userId);
    }
    configuredFor = userId;
    return true;
  } catch (e) {
    console.warn("purchases: configure failed", e);
    return false;
  }
}

/** The two monthly packages, keyed by plan. Null when RC is unavailable or
 *  the offering isn't set up yet — the paywall then shows static prices. */
export async function getPlanPackages(): Promise<Record<PlanKey, PurchasesPackage | null> | null> {
  if (!purchasesAvailable() || configuredFor === null) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const available = offerings.current?.availablePackages ?? [];
    const byProduct = (id: string) =>
      available.find((p) => p.product.identifier === id) ?? null;
    return {
      ai_plus: byProduct(PLAN_PRODUCTS.ai_plus),
      ai_pro: byProduct(PLAN_PRODUCTS.ai_pro),
    };
  } catch (e) {
    console.warn("purchases: getOfferings failed", e);
    return null;
  }
}

export interface PurchaseOutcome {
  status: "purchased" | "cancelled" | "error";
  message?: string;
}

export async function purchasePlan(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  try {
    await Purchases.purchasePackage(pkg);
    return { status: "purchased" };
  } catch (e) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err.userCancelled) return { status: "cancelled" };
    return { status: "error", message: err.message ?? "Purchase failed" };
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!purchasesAvailable() || configuredFor === null) return null;
  try {
    return await Purchases.restorePurchases();
  } catch (e) {
    console.warn("purchases: restore failed", e);
    return null;
  }
}

# Subscriptions setup (RevenueCat + Apple IAP)

The app sells two auto-renewable monthly subscriptions that grant simulator
units by setting `profiles.tier` (via the RevenueCat webhook →
`/api/rc-webhook` on the web backend):

| Plan    | Product ID                             | Price     | Grants tier | Units/mo |
|---------|----------------------------------------|-----------|-------------|----------|
| AI Plus | `com.tim.ieltsspeaking.aiplus.monthly` | US $9.99  | `ai_plus`   | 12       |
| AI Pro  | `com.tim.ieltsspeaking.aipro.monthly`  | US $19.99 | `ai_pro`    | 36       |

The code is fully wired; the steps below are one-time console setup.

## 1. App Store Connect

1. **Agreements, Tax, and Banking** → sign the *Paid Applications* agreement
   (banking + tax forms). Nothing sells until this is Active.
2. App → **Monetization → Subscriptions** → create a subscription group
   `IELTS Speaking Membership`, then two auto-renewable subscriptions with
   the EXACT product IDs above, 1-month duration, prices as above.
   Add an App Store localization (display name + description) for each.
3. Products must be in "Ready to Submit" before sandbox testing works.

## 2. RevenueCat (free account)

1. Create a project at app.revenuecat.com → add an **App Store** app with
   bundle ID `com.tim.ieltsspeaking`. Upload an App Store Connect **In-App
   Purchase key** (ASC → Users and Access → Integrations) when prompted.
2. **Entitlements**: create two, with EXACTLY these identifiers:
   - `ai_plus` → attach product `com.tim.ieltsspeaking.aiplus.monthly`
   - `ai_pro`  → attach product `com.tim.ieltsspeaking.aipro.monthly`
3. **Offerings**: in the `default` offering add both products as monthly
   packages.
4. **Webhook** (Project settings → Integrations → Webhooks):
   - URL: `https://ielts-speaking-simulator-mauve.vercel.app/api/rc-webhook`
   - Authorization header value: the `RC_WEBHOOK_SECRET` value
     (already set in Vercel prod — ask for `rc-webhook-secret.txt`).
   - Send all event types.
5. Copy the **public Apple API key** (starts `appl_`) from
   Project settings → API keys.

## 3. Build config

- Put the key in the mobile env (both `.env` for local builds and
  `eas.json` → `build.production.env`):
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxxxxxxx`
- Rebuild iOS (react-native-purchases is a native module — pod install
  required, already handled by the normal build pipeline).

## 4. Test (sandbox)

1. ASC → Users and Access → Sandbox Testers → create a tester.
2. On the device: Settings → App Store → Sandbox Account → sign in.
3. In the app: account menu → Upgrade plan → subscribe. Sandbox renewals are
   accelerated (1 month ≈ 5 min), so expiry/restore paths can be watched in
   the `sim_subscriptions` table within an hour.

## Behavior notes

- Without `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (or on Android, which has no Play
  Billing in sideloaded builds) the paywall renders in preview mode: static
  prices, purchase button explains where to subscribe.
- The webhook never lowers a tier it didn't grant (ielts-pro sells into the
  same `profiles` table); on expiry it restores the exact pre-purchase state
  snapshotted in `sim_subscriptions`.
- The webhook treats RC as source of truth for renewals/expiry — no cron
  needed.

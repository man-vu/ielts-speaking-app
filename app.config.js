// Dynamic layer over app.json: enables Sign in with Apple always, and wires
// the Google Sign-In native plugin ONLY when an iOS OAuth client ID is
// provided (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID). Without it, the Google button
// hides itself and no half-configured native plugin ships.
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  // NOTE: expo-apple-authentication has NO config plugin — Sign in with Apple
  // is enabled purely by ios.usesAppleSignIn below. Listing it as a plugin
  // throws "Failed to resolve plugin for module" during prebuild.
  const plugins = (config.plugins || []).filter(
    (p) => (Array.isArray(p) ? p[0] : p) !== "@react-native-google-signin/google-signin"
  );

  if (iosClientId) {
    // iOS URL scheme is the reversed client ID.
    const scheme =
      "com.googleusercontent.apps." +
      iosClientId.replace(/\.apps\.googleusercontent\.com$/, "");
    plugins.push(["@react-native-google-signin/google-signin", { iosUrlScheme: scheme }]);
    // Google's transitive Swift pods need modular headers to link statically.
    plugins.push("./plugins/with-modular-headers");
  }

  // Sign in with Apple is on by default; EXPO_NO_APPLE_SIGNIN=1 disables the
  // entitlement for local Mac device builds where Xcode automatic signing
  // can't provision the capability (EAS builds always keep it on).
  const appleSignIn = process.env.EXPO_NO_APPLE_SIGNIN !== "1";

  return {
    ...config,
    ios: { ...config.ios, usesAppleSignIn: appleSignIn },
    plugins,
  };
};

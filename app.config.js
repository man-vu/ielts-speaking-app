// Dynamic layer over app.json: enables Sign in with Apple always, and wires
// the Google Sign-In native plugin ONLY when an iOS OAuth client ID is
// provided (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID). Without it, the Google button
// hides itself and no half-configured native plugin ships.
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  const plugins = (config.plugins || []).filter(
    (p) => (Array.isArray(p) ? p[0] : p) !== "@react-native-google-signin/google-signin"
  );
  plugins.push("expo-apple-authentication");

  if (iosClientId) {
    // iOS URL scheme is the reversed client ID.
    const scheme =
      "com.googleusercontent.apps." +
      iosClientId.replace(/\.apps\.googleusercontent\.com$/, "");
    plugins.push(["@react-native-google-signin/google-signin", { iosUrlScheme: scheme }]);
  }

  return {
    ...config,
    ios: { ...config.ios, usesAppleSignIn: true },
    plugins,
  };
};

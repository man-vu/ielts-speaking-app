const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * GoogleSignIn (via @react-native-google-signin) pulls in AppCheckCore, a
 * Swift pod whose deps (GoogleUtilities, RecaptchaInterop) don't define
 * modules — so pod install fails with "cannot be integrated as static
 * libraries". `use_modular_headers!` makes them generate module maps. This
 * leaves linkage otherwise unchanged (react-native-audio-api's vendored
 * static libs keep working), unlike switching to useFrameworks.
 */
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfile, "utf8");
      if (!contents.includes("use_modular_headers!")) {
        contents = contents.replace(
          /(platform :ios[^\n]*\n)/,
          "$1use_modular_headers!\n"
        );
        fs.writeFileSync(podfile, contents);
      }
      return cfg;
    },
  ]);
};

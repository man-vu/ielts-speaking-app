// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Metro resolves this project with legacy (non-exports) resolution, so the
// "@google/genai/web" subpath export is invisible to it. Redirect both the
// bare package and the /web subpath to the real web build — the only one
// whose Live API works outside Node/browsers (plain WebSocket + fetch).
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@google/genai" || moduleName === "@google/genai/web") {
    return context.resolveRequest(
      context,
      "@google/genai/dist/web/index.mjs",
      platform
    );
  }
  return (defaultResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform
  );
};

module.exports = config;

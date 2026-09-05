// Extends app.json. Adds the Firebase config for push notifications only when the file is present,
// so a fresh clone still builds; see README "Push notifications" for how to obtain it.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, "google-services.json");
  return {
    ...config,
    android: {
      ...config.android,
      ...(fs.existsSync(googleServices) ? { googleServicesFile: "./google-services.json" } : {}),
    },
  };
};

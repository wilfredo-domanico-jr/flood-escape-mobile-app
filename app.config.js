// Extends app.json. Adds the Firebase config for push notifications only when the file is present,
// so a fresh clone still builds; see README "Push notifications" for how to obtain it.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  // On EAS Build the file arrives as a secret file variable (GOOGLE_SERVICES_JSON holds its path);
  // locally it sits next to this file and is gitignored.
  const googleServices = process.env.GOOGLE_SERVICES_JSON || path.join(__dirname, "google-services.json");
  return {
    ...config,
    android: {
      ...config.android,
      ...(fs.existsSync(googleServices) ? { googleServicesFile: googleServices } : {}),
    },
  };
};

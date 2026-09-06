// Dynamic config. Expo reads app.json first and passes it in as `config`,
// then this file's return value becomes the final app config.
//
// This exists for one reason: googleServicesFile must come from the
// GOOGLE_SERVICES_JSON file environment variable on EAS Build, and static
// app.json cannot read environment variables.
//
// On EAS  -> process.env.GOOGLE_SERVICES_JSON is an absolute path to the
//            secret file that EAS writes onto the build runner.
// Locally -> the variable is unset, so it falls back to the gitignored
//            google-services.json in the project root.

export default ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
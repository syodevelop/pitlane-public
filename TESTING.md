# Release checks

Use this checklist when preparing a gameplay release. Record results against the exact commit being tested; the checklist itself is not evidence that a check passed.

## Automated checks

With Node.js 24 installed:

```sh
npm ci
npm run verify
```

`verify` runs TypeScript, ESLint, unit tests and the production build. Record failures, skipped tests and build warnings with the result.

For wallet and save-flow checks, install Microsoft Edge and start the isolated local runtime:

```sh
npm run preview:predeploy
```

Leave that terminal running. In a second terminal:

```sh
npm run test:workshop-account-browser
```

The browser test targets `http://127.0.0.1:8877`. It creates synthetic identities and local test data, so keep it pointed at the isolated runtime. Review its result file and screenshots under `docs/qa/workshop-accounts-2026-11-02/`. That folder name is the script's fixed output location, not the date of the latest run; record the run date separately.

## Manual smoke check

- [ ] Open the game through both landing-page Play links and directly through `/play`.
- [ ] Sign in with a browser wallet, choose a character and verify that returning does not offer a new character selection.
- [ ] Complete a service job, collect its reward and reload. Check that the saved job result and balance return.
- [ ] Interrupt a save, restore the connection and retry. Check that play resumes without a duplicate reward.
- [ ] Open the same account in another tab. Confirm that the older writer cannot overwrite the newer save.
- [ ] Check movement, work markers, pause controls and HUD visibility on desktop and a touch device.
- [ ] Check the player list through the local password-protected admin. Confirm that a signed-out browser cannot read its data.

## Recording a result

Include the commit SHA, date, browser/device, viewport, commands run and observed results. For a failure, add reproduction steps and expected behavior. Keep screenshots free of credentials and unnecessary player information.

Documentation-only changes need link and content checks. Rerun gameplay tests when code, configuration or a newly discovered concern warrants them.

# MLB scoreboard maintenance

- React entry: src/main.jsx. App/navigation: src/App.jsx. Components: src/components.
- Engine compatibility modules in src/engine retain tested MLB/Web Push/detail renderer logic. React-managed DOM must not be mutated by engine code. Fixed detail hosts are intentionally memoized and remain mounted between page switches.
- Build using npm ci and npm run build; test using npm test (install Playwright Chromium first). Commit package-lock.json and generated root index.html, assets/app-<version>.js, its license file, and generated PNG icons, since GitHub Pages serves the root directly.
- Preserve the existing Worker and subscription format unless the task specifically calls for changing them.
- Follow user version rules: bug/UI patch +1, feature minor +1, major only explicitly requested.
- Before repository writes, read the latest main SHA. Never overwrite concurrent changes.
- Keep footer, package version, resource version references, README and icons in sync. version.json must be updated LAST in a separate commit after deployed assets have been verified.
- Do not describe browser simulations as physical iPhone/Web Push tests.

# Opera GX + Playwright CDP

The project controls a separate Opera GX instance through CDP. It never uses
your normal Opera profile: its temporary profile is `.opera-gx-cdp-profile/`.

Run these commands from the project root:

```powershell
npm run opera:gx:start
npm run opera:gx:status
npm run opera:gx:test
```

`npm run opera:gx:ready` starts Opera GX and runs a safe smoke test. The test
opens `example.com`, then uses a temporary local page to verify navigation,
DOM reads, clicking, typing, console events, network events, and a screenshot.
It does not sign in, submit forms, or change website data.

Optional environment variables:

```text
OPERA_GX_PATH=C:\\Users\\Administrator\\AppData\\Local\\Programs\\Opera GX\\opera.exe
OPERA_GX_CDP_PORT=9222
OPERA_GX_CDP_URL=http://127.0.0.1:9222
```

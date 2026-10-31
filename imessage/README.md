# Text Finland — iMessage agent (Photon Spectrum)

Text a yes/no question to our iMessage handle; 500 synthetic Finns answer it via Kansa and you get two bubbles back:

1. `Finland says 41% yes. Helsinki region 63%, Lapland 18%.`
2. One vivid quote with name, age and town, plus a link to the full map.

Empty, very short or abusive messages get three example questions instead.

## Run

```bash
cd imessage
npm install
export PROJECT_ID=...        # app.photon.codes → project Settings
export PROJECT_SECRET=...    # same page
export KANSA_URL=https://<our-vercel-url>
npm start                    # = tsx agent.ts
```

- Spectrum holds an outbound connection to Photon, so no public URL or tunnel is needed. **Keep this laptop awake and online through judging** (`caffeinate -dis` on macOS).
- `SPECTRUM_PROJECT_ID` / `SPECTRUM_PROJECT_SECRET` also work (SDK fallbacks).
- Depends on `POST /api/ask?format=json` returning the `done` event (see `lib/types.ts`) with `quotes[]`.

## Verified vs assumed

- Verified: package `spectrum-ts@12.14.0`, `Spectrum({projectId, projectSecret, providers: [imessage.config()]})`, `for await (const [space, message] of app.messages)`, `message.content.type === "text"`, `space.send(a, b)` for multiple bubbles, `space.responding(fn)` for the typing indicator. `npx tsc --noEmit` passes against the installed types.
- Not yet tested end to end: needs real Photon credentials and an iMessage number from the Photon team. Ask them on site for the fastest path to a handle.
- Prize rule: the submission must include a reachable **iMessage** handle (SMS-only doesn't qualify). Test from someone else's iPhone before 20:50.
- Region names: the summary looks for `Uusimaa` and `Lappi`/`Lapland`; if Eemil's data uses other names it falls back to the highest and lowest region.

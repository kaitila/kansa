# Night Hack runbook — 30.10.2026 (all times PT)

Hard deadlines: **submit by 20:50** (form closes 21:00) · top 7 demo ~22:00 · **no re-entry after 22:00**.

## Now → 18:45 — setup
- [ ] All four (Robin, Arttu, Juho-Matti, Eemil) individually **approved on Luma and checked in**. Check-in is what unlocks the builder perks.
- [ ] Before the build gets far: **disclose pre-existing code** to organisers (Eemil's repo, see submission.md).
- [ ] Redeem perks after check-in: Anthropic $50 credits (first 200), Photon $100, Firecrawl.
- [ ] Anthropic console → Limits: note which key has the highest tier. Collect every spare key.
- [ ] Vercel project `kansa` linked to GitHub `kaitila/kansa` (private). Env vars (Production + Preview):
  - `ANTHROPIC_API_KEYS` = comma-separated keys (round-robin pool)
  - `KANSA_CONCURRENCY` = `50` (raise to `100` if no 429s)
- [ ] Decide who (if anyone) leaves for the Velocity events. Nobody leaves if it means missing the 22:00 demo.

## 18:45 — first deploy
- [ ] Public URL opens **on a phone on cellular** (not venue wifi): map + grey dots.
- [ ] `curl -N -X POST $URL/api/ask -d '{"question":"test","n":100,"live":true}'` streams batches.

## 19:30 — checkpoint (go/no-go)
- [ ] One live question end to end on the public URL, on a phone.
- [ ] If not working: **cut the society layer**. Everything goes into ask + map + counter + cache.
- [ ] If passing: Robin starts the iMessage agent (time-box: drop at 20:15 if not replying).

## 20:15
- [ ] Precompute the 3 demo questions at n=5,000 → `public/cache/*.json`, deployed.
- [ ] Calibration JSON in `public/data/calibration_runoff2024.json`, Tab 2 renders.
- [ ] iMessage: replies from **someone else's iPhone** or it's cut.

## 20:30 — FEATURE FREEZE
- [ ] Bug fixes only. Arttu owns main.
- [ ] Fill numbers in demo-script.md and submission.md from the cached runs.
- [ ] Decide who talks (Eemil) and who clicks (Robin).

## 20:30–20:50 — rehearse
- [ ] 3× 90 s run with timer.
- [ ] Record backup screen video of a full run → `~/Desktop/kansa-backup.mp4`.
- [ ] Phone QA, all on cellular: chip run, live run, persona card tap, Tab 2, Let them talk.

## 20:50 — SUBMIT
- [ ] Paste submission.md into the Luma/event form. Captain contact filled. Demo URL tested on another device. iMessage handle included only if it works.
- [ ] Screenshot the confirmation.

## 21:00–22:00 — pre-warm
- [ ] Run likely judge questions (sauna, four-day week, NATO troops, nuclear, remote work) so they're cached.
- [ ] Charge laptops and phones. Hotspot ready (name/password on a sticky note).
- [ ] iMessage laptop: `caffeinate -dis`, lid open, agent running.
- [ ] Browser: full-screen, zoom so text reads from the back of the room, notifications off.
- [ ] Stay inside: no re-entry after 22:00.

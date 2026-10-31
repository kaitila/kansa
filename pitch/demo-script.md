# Kansa — 90-second demo script

Rules: 90 s target, **2:00 hard stop**, no slides. Map already on screen with grey dots when we start.
Eemil talks. Robin clicks. ~200 words, three clicks.
`[BRACKETS]` = fill with real numbers at 20:30 from the cached run we'll show.

| Time | Say (Eemil) | Do (Robin) |
|---|---|---|
| 0:00 | "This is Finland. Every dot is a person: five thousand synthetic Finns sampled from Statistics Finland, so they match the real country by age, income, education, language and town." | Nothing. Grey dots. |
| 0:12 | "You can ask them anything. Should private cars be banned from central Helsinki?" | Click the **car-ban chip** → Ask |
| 0:15 | "That's [250] Claude calls in parallel. [5,000] people answering in [20] seconds." | Point at the counter as dots light up |
| 0:30 | "Finland says [41]% yes. But Uusimaa [63], Lapland [18]. Click anyone." | Click a **rural dot** → card: "[Name], [71], [Kuopio]: '[quote]'" |
| 0:45 | "Polls stop here. Societies don't. Let them talk to their neighbours, and then a headline hits." | **Let them talk**, pick the headline |
| 1:00 | "Support barely moves, but polarisation goes from [x] to [y] percent. That's how a country splits." | Point at the meter and sparkline |
| 1:10 | "Why trust any of this? We re-ran the 2024 presidential election. Synthetic Finland matched the real regional result with r = [0.x], [y] points off." | **Tab 2**, scatter |
| 1:22 | "A national poll costs weeks. This took twenty seconds and about [13] cents. You can also just text it: [handle]." | Back to the map. Stop. |

**If calibration is bad**, replace the 1:10 line with:
"Why trust any of this? You shouldn't, blindly. We re-ran the 2024 election: synthetic Finland is [y] points off, and it breaks exactly here: [region]. That's the measurement we think every synthetic-society product owes you."

**If polarisation doesn't rise** for the car-ban question, use the question where it did (check the cache at 20:15) and say: "Watch what happens to [Uusimaa] vs [Lappi]."

---

## 60-second fallback (we're behind, or the society layer is cut)

| Time | Say | Do |
|---|---|---|
| 0:00 | "Five thousand synthetic Finns, sampled from Statistics Finland. Ask them anything." | Car-ban chip → Ask |
| 0:08 | "[250] Claude calls in parallel, [20] seconds." | Counter |
| 0:20 | "Finland says [41]% yes. Uusimaa [63], Lapland [18]. Here's [Name], [71], from [Kuopio]: '[quote]'." | Click a dot |
| 0:35 | "And we checked it: synthetic Finland re-voted the 2024 runoff and came out [y] points off, r = [0.x] across regions." | Tab 2 |
| 0:50 | "Twenty seconds instead of weeks. Text it: [handle]." | Stop. |

---

## If the wifi dies

1. Switch the laptop to **Robin's phone hotspot** (pre-paired, name/password on a sticky note). Chip runs are cached, so they replay with almost no bandwidth.
2. If the hotspot fails too: play the **backup screen recording** (`~/Desktop/kansa-backup.mp4`, full-screen, sound off) and Eemil narrates the same script over it. Open with: "Venue wifi is down, so this is a recording of a run from 20:40 — same product, same URL."
3. Never fake live: if it's a recording or a cached run, say so. The UI shows a "cached run" label anyway.

## Rehearsal (20:30–20:50)

- Run the 90 s script 3× with a phone timer. Cut words, not beats, if over 1:30.
- Decide who clicks and who talks by 20:30. Default: Eemil talks, Robin clicks.
- Record the backup video on the 2nd run (QuickTime → New Screen Recording, 1080p).

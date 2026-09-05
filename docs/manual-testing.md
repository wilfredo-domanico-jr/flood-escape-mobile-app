# Manual testing guide

Automated checks cover the pure logic and the database (`npm test`, `npm run test:db`). Everything
involving a real phone must be checked by hand. This guide walks through Phases 3 to 10 in the
order a demo would follow. Two phones (or one phone plus an emulator running the development build)
make the verification and realtime steps meaningful.

Before you start: `.env` filled in, `npm run db:push` reports "up to date", anonymous sign-ins
enabled in the Supabase dashboard, the development build installed (`npx expo run:android`), and
`npx expo start` running. Expo Go cannot run this app: the map (MapLibre) is native code.

## Phase 3: map and location

| Step | Expect |
|---|---|
| Open the Map tab with location off | Metro Manila view, a card asking to enable location, no crash. |
| Tap Enable location and allow | Map animates to you; blue dot appears; the sheet header says how many reports are in view. |
| Pan to a different area | The sheet updates within a second; a brief "Updating" chip appears. |
| Pan far away, then tap the locate button | Map returns to you. When you are more than 500 m from the view center a "Back to my location" pill shows. |
| Zoom out to see the whole country | Chip reads "Zoom in for live updates"; the query is still bounded (no giant fetch). |

## Phase 4: reporting

| Step | Expect |
|---|---|
| Tap Report flooding | Pin sits on your position with the GPS accuracy text; four severity buttons; photo and notes optional. |
| Drag the pin, then tap Submit without a severity | "Pick how bad the flooding is." Nothing is sent. |
| Pick a severity, add a photo from the camera, submit | You return to the map; a dashed "Sending…" pin appears, then becomes a solid pin within a few seconds. In the dashboard, `flood_reports` has the row, `report_authors` links it to you, and Storage has `reports/<id>.jpg` under 2 MB. |
| Submit again within 50 m | The pre-submit banner offers "Confirm it instead"; if you report anyway, the server folds it into the same report (still one row, severity updated). |
| Submit four reports in different spots within 15 minutes | The fourth fails in Activity with the rate-limit message (anonymous accounts get 3 per 15 minutes). |
| Airplane mode, submit a report | "Saved. You're offline…" alert; the You tab shows it under "Not sent yet"; the offline banner counts it. Disable airplane mode: it sends within about 30 seconds with no duplicate. |
| Kill the app while a report is queued, reopen | The queued item is still there and sends. |

## Phase 5: report details

| Step | Expect |
|---|---|
| Tap any pin | Details screen: severity, status, "Reported N min ago", distance, confidence card with reasons, photo, notes, activity. |
| Open one of your own reports | "This is your report…" with Mark as no longer flooded. Marking it moves it to Cleared and removes it from the map. |
| Open `floodescape://report/<id>` from a note or browser | The app opens directly on that report. |

## Phase 6: verification and confidence

| Step | Expect |
|---|---|
| Phone B opens Phone A's fresh report while standing within 1 km | Still flooded / No longer flooded buttons are enabled. |
| Phone B taps Still flooded | Thanks message; confidence rises (about 45 to 57); the reason list gains "1 person confirmed"; A's profile counter `reports_confirmed` becomes 1. |
| Phone B taps Still flooded again | Disabled with "You said it was still flooded N min ago". |
| Phone A opens its own report | Buttons replaced with the owner card; the RPC also rejects it server-side. |
| Phone B more than 1 km away | Message explaining the 1 km rule; buttons hidden. |
| Two other users tap No longer flooded | Status becomes Disputed, confidence capped at Low. A third with no confirmation in the last hour resolves it. |
| Wait past the stale window (or set `expires_at` to the past in SQL) | Within 10 minutes the pin greys out with "May have receded"; before the cron runs the view already reports it stale. |

## Phase 7: realtime

| Step | Expect |
|---|---|
| Both phones on the Map tab, "Live" chip green | Phone A reports; Phone B's map shows the new pin within about 2 seconds without any touch. |
| Phone B verifies | Phone A's pin and sheet card update (confidence, counts) without refresh. |
| Background Phone B, then return | Chip goes off while backgrounded, reconnects on return, one refetch happens. |
| Turn off Wi-Fi and mobile data | Chip changes to Offline; on reconnect "Live" returns. |

## Phase 8: offline polish

| Step | Expect |
|---|---|
| Airplane mode, cold start | Map shows the last-seen reports; sheet header says "Offline · showing data from N min ago"; You tab shows the offline banner. |
| Leave it offline past a report's expiry | The cached pin turns stale client-side even though no server contact happened. |
| Force a failure (e.g. hit the rate limit) | Activity shows the failed item with the server's reason, Retry and Discard. Discard removes it and its stashed photo. |
| Settings, Privacy, enable "Upload photos on Wi-Fi only"; report with a photo on mobile data | Report sends immediately; Activity shows "Report sent, photo still uploading" until Wi-Fi. |
| Enable "Blur my report locations", submit | The pin lands on a 100 m grid and accuracy shows at least ±100 m. |
| Delete my data | Your reports, photos and votes disappear for everyone; you get a fresh anonymous id. |

## Phase 9: route safety

Requires the routing key: `npx supabase secrets set ORS_API_KEY=<key>` from a free openrouteservice
account. Without it the screen shows "Route checks aren't set up on this server yet."

| Step | Expect |
|---|---|
| Enter a landmark (e.g. "SM Marikina") and Check route | Route polyline drawn; a card reading NO RECENT REPORTS, CAUTION or HIGH RISK with a one-sentence reason and the reports along the way. |
| Report impassable flooding on a road the route uses, check again | HIGH RISK, the report listed with its distance from the line. |
| Enter gibberish | "We couldn't find that place…" |
| Check more than 10 routes in an hour | Rate-limit message. |
| Save this route, then toggle its alert switch and remove it | It appears under Saved routes with a live risk headline; toggles persist; removal asks for confirmation. |
| Airplane mode, open the Route tab | Last result shown with "may be out of date"; the Check button is disabled. |

## Phase 10: evacuation centers

| Step | Expect |
|---|---|
| Open the Centers tab | Nearest facilities sorted by distance with a map above; "Capacity unknown" on the sample rows and a "sample data" note. |
| Toggle categories | List and map update; you cannot deselect the last category. |
| Tap Directions | The platform maps app opens with the destination set. |
| Location off | Distances measured from Metro Manila center with a card offering to enable location. |

## Known gaps to keep in mind

- Sample facility coordinates are approximate. Replace them with LGU or NDRRMC open data before relying on them.
- Push notifications (Phase 11) need an EAS development build and are not built yet.
- Retention deletes rows but cannot delete Storage objects from SQL; an Edge Function will handle orphaned photos in Phase 11.
- Maps come from OpenFreeMap (OpenStreetMap data). No key is needed; attribution is shown on every map.

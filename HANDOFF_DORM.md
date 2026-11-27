# HANDOFF — หาห้อง หาเมท มศว (`/dorm`)

New sub-product: a roommate + room board for SWU Prasarnmit students. It was built
from an analysis of the LINE OpenChat "พี่ มศว พาน้องหาที่พัก หารูมเมท"
(~7,500 members, 880 messages, May–Nov 2026). The summary, with no names or contacts,
is in `backend/data/dorm_insights.json` and is shown at `/dorm/insights`.

Base: `meekintubeDone` @ `0dbb9e5`. Nothing committed.

## Deployment risks

- **None to existing features.** The change adds one router (`/api/dorm/*`), a nested
  route group under `/dorm` (parent `DormShell` + ten lazy pages), and new Mongo collections
  (`dorm_listings`, `dorm_mates`, `dorm_buildings`, `dorm_reviews`, `dorm_reports`,
  `dorm_events`, `dorm_photos`, `dorm_interests`). No existing collection, route or cache key is touched.
- **Photos live in Mongo** (`dorm_photos`, binary, ≤1.5 MB each, compressed to ~1280 px JPEG
  in the browser before upload, usually 100–300 KB). They're served from
  `GET /api/dorm/photos/{id}` with a one-year immutable cache. If the collection grows a lot,
  move it to object storage later; the URL shape can stay.
- Indexes and the 22 seed buildings are created **lazily on the first `/api/dorm` call** (the building seed runs once per process and only inserts slugs that are missing),
  so there is no migration step. Admins can re-seed from `POST /api/dorm/admin/seed-buildings`.
- Outside `pages/dorm`, two small edits: `App.js` gives the `/dorm` route its own `Suspense`
  fallback (`DormFallback`, so direct loads don't flash the site-wide "LOADING…"), and
  `public/index.html` has a one-line script that sets the tab title to "หาห้อง หาเมท มศว" on `/dorm*`.
  An installed service worker may serve the old `index.html` until it updates.
- Static assets in `frontend/public/dorm/`: SVG illustrations in `illustrations/` (hero scene
  `hero.svg` + `hero-city/boat/cloud.svg`, two covers per listing kind `cover-{kind}[-2].svg`,
  `bldg-*.svg` building thumbnails, `empty-mates.svg`, `empty-saved.svg`, `cta-post.svg`) and
  1200x630 PNG share cards (`og/{default,mate_wanted,transfer,room,short_term}.png`, ~100 KB,
  rasterised from the matching `.svg`). The OG page uses them when a listing has no photo.
- Styles are split into three files imported by `DormLayout.jsx`: `dorm.css` (tokens + shared
  components + shell), `dorm-browse.css` (home, rooms, room detail, buildings, saved) and
  `dorm-flow.css` (post, mates, me, insights, admin). All scoped to `.dorm-root` / `.dorm-portal`.
- Nothing links to `/dorm` yet. Add a link from the CMS / home page when it's ready to launch.

## What it does (each feature answers a pain from the chat)

| Pain in the chat (count) | Feature |
|---|---|
| Looking for a roommate without a room (210) · reposting up to 16× | `/dorm/mates`: a profile with budget, zones, move-in month and lifestyle tags, plus a 0–100 match score with reasons and clashes. Gender preference is a hard gate in both directions. |
| Asking for rooms within a budget (106) | `/dorm/rooms`: filter by zone, price per person, gender, amenity and type |
| Asking for building reviews (83) | `/dorm/buildings`: guide built from the chat, plus resident reviews (transit, safety, management, value, quiet) |
| Contract transfers (55) · short stays (32) | listing types `transfer` and `short_term` |
| Flaking, stale posts (26) | everything expires after 30 days, can be renewed with one tap, has a report button and a reserved/closed status |
| The channel itself | `/dorm/admin` builds a weekly digest to paste into the OpenChat. Room pages have "send via LINE" buttons that share `/api/dorm/og/rooms/{id}`, a small page with Open Graph tags (title, price, cover photo) so LINE shows a preview card, which then redirects to the room |

## Design

Third redesign "v4" (26 Nov), after the second one still read as flat. Direction: a **teal "khlong"
(canal) hero with an illustrated Asoke scene** (`hero.svg`: canal, boat, towers, SWU gate), a bright
paper background, crisp data. The **signature element is still the "~N นาทีถึง มศว" badge** on every
listing, building and zone (icon by travel mode). The numbers are estimates (`minutes_to_swu` /
`travel_mode` on buildings; zone fallback `ZONE_GUESS` in `dormApi.js`), always labelled approximate.
- Home: the search card uses **chips** (zone, budget per person) instead of a dropdown and a slider,
  with a **live count** on the button and the "ห้องมาใหม่" rail under it **filtering live** as chips
  change. An empty result shows an in-place message with "ดูทุกห้อง" / "ล้างที่เลือก".
- Listing cards are **2:1 cover cards** (photo or labelled illustration), price in the cover corner,
  save heart, minutes badge, move-in date, split and gender chips.
- **Saved rooms** need no login: ids live in `localStorage` `dorm_saved`, the list is fetched with
  `GET /api/dorm/listings?ids=a,b,c` (max 50, only live listings) and shown at `/dorm/me?tab=saved`
  (the bottom nav shows a count badge). Saving shows a toast with a "ดู" action.
- **Post flow is guest-first**: a guest fills all four steps (ประเภท, ที่ตั้ง, ราคา, รูปและติดต่อ)
  and signs in only at the last button ("เข้าสู่ระบบแล้วลงประกาศ"); publishing then continues by
  itself. The draft is kept in `sessionStorage` `dorm_post_draft` (form, step, and an `owner` tag,
  `guest` or the user id, so a draft is never restored into another account; dropped on sign-out).
  A restored draft shows "เริ่มใหม่" on step 1.
- Room and building pages: the Google Maps embed is **lazy** (the iframe is created only after the user
  taps the map), with an "เปิดใน Google Maps" link and a "ดูเส้นทางไป มศว" directions link.
  Price always shows its unit (บาท/คน/เดือน or ทั้งห้อง/เดือน).
- The rooms page keeps filters **and sort** in the URL, so going back from a room restores both.
- `/api/dorm/mates` returns `hidden_by_gender` (`{total, theirs, mine}`) so the page can say how many
  profiles the two-way gender gate hid instead of looking empty.
- Tokens (in `dorm.css`): paper `#F4F8F8`, ink `#14213D`, khlong teal `#0B7A83` (deep `#075A63`, tint
  `#DFF4F2`) for the hero, links and transit, SWU red `#D4133A` **only** for the primary CTA, active nav and
  logo, sun `#FFB81C` for stars/match. Type: **Mitr** (display) + **IBM Plex Sans Thai Looped** (body).
  Muted text `#5D6778` and the LINE button `#00833E` pass WCAG AA.
- Hand-drawn SVG illustrations (see static assets). A listing with no photo shows its kind cover labelled
  "ภาพประกอบ" (project photos are labelled "ภาพโครงการ ไม่ใช่ห้องนี้"), so nobody mistakes it for the real room.
- shadcn/Radix parts restyled under `.dorm-root` / `.dorm-portal`: ToggleGroup, Select, Tabs, Dialog/AlertDialog,
  vaul Drawer, cmdk building search, embla carousels, Skeletons, calendar date picker (post form).
- Scoped to `.dorm-root`, so the rest of swumkt is unaffected and doesn't need to match.

UX decisions:
- **Sign-in happens in a sheet on the same page** (Google, or email sign-up/login), then the
  action continues by itself (the contact appears, with full LINE ID + copy button). Mobile uses a
  non-modal full-screen Dialog so Google's iframe stays clickable and inputs don't jump.
- Posting (4 steps) and the roommate profile are forms with a live preview, an auto-suggested
  title, a per-person price that recalculates as you type, and inline error messages. Thai dates
  (calendar date picker or day + month selects), a searchable building picker, and a success screen with LINE share / copy link.
- "ของฉัน" always lists my listings first (stats, days left, renew / reserved / close / reopen,
  share). The mate profile is a separate tab, starts empty (no preset gender/year/budget), and
  is prefilled from my listing when I have one. Shows the signed-in email + logout.
- All destructive actions use an in-app AlertDialog (`useShell().confirm()`), never `window.confirm`.
- Mobile: bottom nav with a raised "+ ลงประกาศ", quick chips plus filters in a bottom sheet with readable removable
  chips, last rooms query remembered (sessionStorage). Desktop: filter rail + card grid, max 1280 px.
- "ยืนยันนิสิต มศว" badge only when the server says so: `poster_swu_verified` / `swu_verified` are
  true only for **Google** sign-in with an `@swu.ac.th` / `.swu.ac.th` address (email sign-up is unverified).

Privacy: LINE, phone and IG never appear in list or detail responses. They come only
from `GET /api/dorm/{listings|mates}/{id}/contact`, which needs a login and logs a lead
in `dorm_events`; the owner sees the count. Mate profiles need explicit consent.

## Project photos and the chat archive (added after the v4 round)

**Project photos (hot-linked, NOT licensed).** `dorm_buildings_seed.json` has `photos[]` (`{url, credit...}`)
and `official_url` per building: photos on 21 of 22 buildings, from **PropertyScout**, **FazWaz** and **Renthub** (the 8 student dorms added later
are Renthub; credit shown on each). Only https URLs are stored, no image file is in the repo. Building endpoints return `photos`,
`official_url` and a server-picked `thumb` (first photo under 700 KB, `THUMB_MAX_BYTES`), so 21 buildings have a
card thumb. Shown on building cards, the building page gallery (credit link, "เว็บโครงการ" link) and on listings
with no photo of their own (cover labelled "ภาพโครงการ ไม่ใช่ห้องนี้", with credit and a nudge to add own photos). A dead link falls back to the illustration.
- Summer Place (`summer-place-huaikwang`) has no photos: the building could not be identified.
- FazWaz images carry a small FazWaz watermark. Three exteriors are weak: Ideo Mobi (520x300 aerial), Ideo Rama 9
  (night skyline), Lumpini Park (gate sign). Replace them first.
- **Deployment note:** a fresh database gets photos from the seed, but the backfill only fills buildings whose
  `photos` field is *missing*. A database whose building documents already have `photos: []` is not backfilled: do a
  one-off update, or call the admin seed endpoint (`POST /api/dorm/admin/seed-buildings`, which overwrites admin edits).
  The local sim DB was updated directly in Mongo.
- **Before a public launch the owner must get permission from PropertyScout, FazWaz and Renthub, or replace the photos with own ones.**

**Chat archive (price reference, not availability).** `backend/data/dorm_chat_posts.json`: 190 anonymised ads from the
OpenChat, 2026-05-29 to 2026-11-25. Each record has only structured keys: `id, date, reposts, kind, building_slug,
building_name, zone, price_total, price_per_person, people_total, room_type, gender_pref, move_in, budget_min,
budget_max, amenities`; no names, contacts or message text. It is loaded once into memory (`load_chat_posts()`,
`clean_chat_posts()` whitelists keys) and served by `GET /api/dorm/chat-posts` (filters `building`, `zone`, `kind`; adds a
derived `per_person`). `chat` summaries (count, min / median / max per person, latest month) ride on the building
endpoints and `/api/dorm/stats`. Shown on: the building page ("ราคาที่เคยเห็นในกลุ่ม OpenChat" + past ads, "ดูเพิ่ม"),
building cards, home (zone price ranges "เคยเห็น ... ฿/คน" + a trust line), a dashed muted section under the rooms
results (follows the zone/kind filters; "ไว้ดูราคา ไม่ใช่ห้องว่างตอนนี้"), and the mates page (past seeking posts).
Every block says the ad is old, has no contact info and the room may be gone.
- Produced by `C:\ClaudeCode\SwuDorm\tools\extract_chat_posts.py` (outside this repo): parses the chat export, drops
  names/contacts/text, keeps structured fields. Spot-check accuracy about 95% on kind and price.
- Known weaknesses: total vs per-person price is ambiguous in some mate ads, many records have `zone: null`, and
  misspelled building names are missed (so those ads have no building).
- **It must never gain names, LINE ids, phone numbers or free text.** A privacy scan (Thai phone patterns, 9+ digit runs,
  `@`, `http`, `line.me`, "ไลน์", "ไอดี") of the file and of `/chat-posts?limit=200` found nothing on 26 Nov. Re-run it when
  the file is regenerated.

## External listings, interest and round-2 fixes (added after the second customer panel)

**External listings** (`backend/data/dorm_external_listings.json`, 76 rows: PropertyScout 59, Renthub 17). Facts only
(building, price, size, floor, bedrooms, furnished, deposit/advance months, photo URLs, `source_url`, `seen_at`): no
contacts, no description text. `routes/dorm.py` imports them into `dorm_listings` with `external: true` and
`id = "x" + sha1(ext_id)[:11]`, a generated title, `expires_at = seen_at + 21 days` (`EXT_TTL_DAYS`). The import re-runs when
the file changes (and on `POST /api/dorm/admin/import-external`); rows an admin closed are never resurrected. Per-person
price is a default split by room type (studio 2, 1BR 2, 2BR 3, 3BR 4); room detail has a split calculator, a source box
("ดูประกาศต้นทาง", `rel="nofollow noopener"`) and says deposit/utilities are to be confirmed at the source. The contact
reveal refuses external rows (409), and the UI sends people to the source site.
- **Licensing:** external rows and all hot-linked photos (PropertyScout, FazWaz, Renthub) are third-party content shown as
  facts + link + credit, **not licensed**. Get permission or replace before a public launch.
- **Operations:** the file was produced by a manual agent run (respecting robots.txt, skipping sites that block bots). There is
  **no scheduled job**: external rows go stale and expire after 21 days, so the section empties unless the file is regenerated
  and the app re-imports it. Home says "ตอนนี้มี N ห้องให้ดู", counting these rows.

**Interest ("มีคนรอหาร").** New collection `dorm_interests` (unique per listing + user, `party_size` 1-3, max 10 per user).
- `POST` / `DELETE /api/dorm/listings/{id}/interest`: 428 when the user has no mate profile (the UI opens a short profile sheet);
  403 when the listing is gender-restricted and the viewer is of the excluded gender.
- `GET /api/dorm/listings/{id}/interested` returns `access` (`guest` / `no_profile` / `profile` / `owner`) and an empty `items`
  for guests and profile-less users (gender gate + hidden count for the rest). `GET /api/dorm/my/listing-interest` lists a user's own.
- List/detail rows carry `interest_count`, `interest_people`, `my_interest`, `interest_match`, `interest_blocked`, and
  `interest_avatars = [{initials, tone}]` (initials only, never names), plus `whole_first`. The old "spots / ครบแล้ว" copy was removed
  (`spots_*` fields are still returned but unused). Filter `interested=1`; list responses carry `external_total`. `/mates` returns
  `interested_rooms` only to viewers with a profile (empty for guests); `/my` returns `interests`.
- UI: `frontend/src/pages/dorm/DormInterest.jsx`, home rail "ห้องที่มีคนรอหาร", rooms chip "มีคนรอหาร", "ของฉัน" tab "ห้องที่ฉันสนใจ". A locked
  interest button ("ประกาศนี้รับ... เท่านั้น") shows when the listing excludes the viewer; on the phone action bar the note gets its own row (or wraps
  next to the source link on external rooms) so "ทักผู้ลงประกาศ" stays readable.

**Sorting and paging.** `sort=recommended` (featured, then posts made on the site newest first, then external rooms by per-person price ascending) is the default on the rooms page and the first home rail
"ห้องแนะนำ"; the **API default is still `new`**. Other sorts: `new`, `price`, `interest`, `move_in`. Every sort has an `id` tiebreaker, so
paging never repeats or drops a row (checked: 76 unique rooms per sort). `limit` is 1-300, `skip` is 0 or more. The per-person price is the
card headline, except single rooms and the three single-occupant kinds (ห้องว่างให้เช่า, ส่งต่อสัญญา, ระยะสั้น: they default to 1 occupant,
field "อยู่ได้สูงสุดกี่คน"). `price_per_person` is derived server-side.

**Rules added after the journey QA (API).** Leads are counted once per viewer + target; contact reveal on a closed/expired listing returns 410
(and 409 for external rows); `closed_by` / `closed_at` are stored, owners cannot reopen admin-closed listings, and the 5-active cap also applies
on reopen and renew; impossible or past dates are rejected; an uploaded photo must decode with Pillow and oversize returns 413; `/meta` has
`report_reasons_by_type` and `report_note_max`. The OG page for a closed/expired listing shows a neutral card; its origin comes from
`DORM_SITE_ORIGIN`, else an https `FRONTEND_URL`, else the Host header (`X-Forwarded-Host` is ignored). The buildings list is cached for 60 s
(`invalidateBuildings()` on the client after a review). The backend caches users for about 5 minutes, so a role change needs a reload.

**Admin.** `GET /api/dorm/admin/overview` changed shape: reports gain `target_title` / `target_link` / `target_status` and no longer carry
`user_id`; the listings table has no contact fields. The admin page now has reports with links and notes, a listings table (feature,
close/reopen, "ไม่ว่างแล้ว" for external rows, delete) and an external-import button.

**Round-2 fixes:** toasts above fixed bars; clean top-bar transition on home; truthful mates count ("N คนกำลังหาเมท ตรงกับคุณ M คน");
sign-in sheet default tab, labels, and the action continues after sign-in; month picker starts at the current month; archive
stats rules (mate ads with only a total up to 8,000 are treated as per-person "~x ฿/คน"; min/median/max only with 5+ values;
"จากประกาศตอนนี้" vs "เคยเห็นในแชท"); guest photo picking before sign-in; building photo re-ordering; desktop rooms layout and
reliable scroll restore; tablet (768+) gets the top nav and 2 columns; archive rows lead with informative ones and end with actions;
double-tap guard + OpenChat caption on the success screen; `?q=` on buildings; owners can delete closed listings (also removes
their photos and events).

**Hero art:** `illustrations/hero-city.svg` has an SWU-style tower with "SWU" drawn as shapes and an animated 8-bit panda on top
(6 s stepped loop, static under `prefers-reduced-motion`, 36 KB).

**Buildings:** 22 in the seed (8 student dorms/apartments added, photos from Renthub, 21 with a card thumb). Minutes to SWU for
the 8 new dorms are distance estimates.

**Demo data to remove before launch:** 3 demo mate profiles ("ตัวอย่าง") and 5 demo interests flagged `demo: true`
(`db.dorm_interests.deleteMany({demo:true})`). The 4 "[ตัวอย่าง]" demo listings were deleted from the sim DB; the listings
you see now are the external rows.

**Single rooms.** `is_single_room()` in `routes/dorm.py` sets `single_room` on listing payloads (no bedroom, and under 28 sqm or
in an apartment/dorm building; 16 rows). Cards show `6,500฿/ด.` then "อยู่คนเดียว หรือหาร 2 คนละ 3,250" (highlighted "ตรงงบเมื่อหาร 2 คนละ ..."
when it only fits the budget by sharing); the split calculator starts at 1 (max 2); the interest button reads "หาเมทมาหารห้องนี้".

**Group cards.** In list views, 3+ external rows from the same building and source with no photo of their own collapse into one
group card (no heart) that opens the building page on its rooms tab (`?tab=rooms`, sorted by price). Unfiltered there are 2
groups (วิชชุวรรณ 6, จิตราภา 3). The room count line still counts real rooms.

**Wording.** Counts that include unverified external rooms don't say "ว่าง": home "ตอนนี้มี N ห้องให้ดู", zone tiles and
building cards "มี N ห้อง", building rooms tab "มี N ห้องที่ประกาศอยู่" (the building page overview and tab label still say "ห้องว่าง").

**Known oddities:** "ไม่ว่างแล้ว" reports need an admin to close the row (the admin page has a button for it); the OG share card for external rooms uses the static image; deposit terms
are unknown for most external rows (only shown when the source gave months).

## Verified (in `emergent-sim`, http://localhost:18090)

- `pytest tests/test_dorm.py tests/test_dorm_api.py` (inside `swumkt-pod`, `/app/backend`) → **89 passed**
  (logic: match score incl. gender gate, budget overlap ranking, pet clashes; end-to-end against the live
  backend: contact privacy, no `owner_id` in lists, lead counting, filters incl. `min_price` and `ids=`, ownership,
  close → 410, match ordering, expiry/renew, review upsert + delete, reports, admin-only digest, photo upload,
  OG page escaping). The API test cleans up its listings, mate profiles and reviews.
- `CI=true yarn build` (inside `swumkt-pod`, `/app/frontend`) → **Compiled successfully** (26 Nov, after external listings + interest).
- Final browser walk as a guest (375x812 and 1280x800): home chips + live rail, rooms (two quick chips both kept,
  sort and filters kept after opening a room and going back), room detail (unit, lazy map, route link, save toast),
  saved tab, buildings, a building page, mates, post flow up to the last button (date picker, draft restored after
  reload, "เริ่มใหม่" clears it), insights: no overflow, no blank blocks, no console errors except service-worker fetches.
- Last guest walk (375x812, plus 768x1024 for home and rooms): home (panda/tower visible, first card peeks, "ห้องที่มีคนรอหาร" rail), rooms (new chip and sort, 4,000-6,000 per person returns 38 rooms), a PropertyScout and a Renthub room (source link, split calculator, interest button opens the sign-in sheet), 22 building cards, a new dorm page, mates, `/dorm/me`: no overflow, no broken images, no console errors except service-worker fetches. Tablet shows the top nav and two columns.
- **Simulated customers, v4 round:** three Sonnet personas rated the v4 build: overall **6 / 5.5 / 6**,
  first impression **7**, visual appeal **7-8**, trust only **4-4.5** because the demo listings (since deleted) had no real
  photos and were labelled "ตัวอย่าง". The review then produced **22 findings, all fixed afterwards and NOT re-rated**,
  so these scores describe the build before those fixes. Earlier rounds (other panels, not directly comparable):
  first version 5 / 6.5 / 5.5, then 6.5 / 7.5 / 7, then 6.5 / 7.5 / 6.5. A second panel after that (overall 5 / 5.5 / 5.5) found the
  gaps that the round-2 fixes, photos, archive, external listings and interest address; **nothing has been re-rated since that second panel.**
- Bugs earlier rounds found and fixed: "ของฉัน" hid my listings without a mate profile; mate form
  preset to female / year 1; unreadable active-filter chips; desktop gallery overflow; sticky
  "next" bar covering fields; LINE button overflowing 375 px; transparent sign-in sheet; inflated
  match % on a thin budget overlap; `owner_id` leaking in list responses; client-side `min_price` over only the
  first 60 results; owner views counted; test reviews left in the DB by the API test; two quick filter-chip taps
  dropping the first filter (router renders in a transition, so the rooms page builds params from `window.location`);
  the raised + covering the post form's Next bar (nav hidden on `/dorm/post` and room detail).

## Customer panel 3 and journey QA (26 Nov, after photos, external listings and interest)

Three simulated customers scored overall **6 / 5 / 6.5**; trust was 6-7 for room seekers, but the poster's confidence was **3** because
there are no real people yet. The journey QA found 15 API failures, 10 seeker-journey failures and about 12 poster/admin failures; **31 decided
fixes (A1-A13, B1-B18) were applied and have not been re-tested by an independent QA pass**, only by the build tests and a guest regression
(home, rooms and paging for every sort, a room with interest showing initials only, mates without room links, wrong password in Thai,
single-occupant post preview, no names or contacts in the JSON).

**Launch checklist:** remove the 3 demo mates and 5 demo interests (`db.dorm_interests.deleteMany({demo:true})`); set `DORM_SITE_ORIGIN`;
re-run the external collection (rows expire 21 days after 2026-11-26); get permission for third-party photos and listings (or replace them);
verify minutes-to-SWU; fix the `/api/auth/register` role and password-length gaps.

## Known gaps / not verified

| Item | Why |
|---|---|
| Third-party content | building photos (PropertyScout, FazWaz, Renthub) and external listings are hot-linked / shown as facts, unlicensed (see above). Trust was the weak score before they were added and has not been re-measured |
| External data freshness | no scheduled refresh; rows expire after 21 days |
| Photos, chat archive, external listings, interest, round-2 fixes | all added after the last customer panel and **not rated** by simulated customers |
| Archive data quality | about 95% spot-check on kind/price; null zones, ambiguous total vs per-person price, missed misspelled building names |
| Minutes to SWU, building zones | estimates from the chat's transit notes, not measured; a human must check `dorm_buildings_seed.json` and `ZONE_GUESS` |
| Google sign-in at the end of the guest post flow | needs the real Google client and origin; the email path was tested, the Google path was not |
| Shared `components/ui/select.jsx` with very long lists | can raise a dev-only ResizeObserver overlay (not seen in the production build); left alone because other pages use it |
| `/dorm/admin` | the new admin UI was not viewed as an admin, and not on small screens; a guest is redirected to the site `/login` |
| Dorm sign-up sheet password length | 6 characters enforced in the browser only; `POST /api/auth/register` still accepts shorter (deliberately untouched, same hole family as the role issue) |
| Not tested | Google sign-in, a real phone file-picker photo upload |
| Register role hole (below) | **FIXED (27 พ.ย. 2569)** — `POST /api/auth/register` rejects privileged roles with 403 |
| Production data / Emergent deploy | deployed live on `swumkt.org/dorm` (subpath redirect from `roommate.swumkt.org`) |
| LINE actually rendering the preview card | LINE's crawler can't reach localhost; the OG HTML was checked directly |
| Real phone photos (HEIC, very large) | tested with generated JPEGs through the same code path |
| Link preview for a copied `/dorm/rooms/{id}` URL | crawlers get the SPA's site-wide meta; only the share link `/api/dorm/og/rooms/{id}` has the listing card (fixing it needs a crawler rule in the ingress) |

## ✅ Fixed: `POST /api/auth/register` privilege escalation hole

Previously, `POST /api/auth/register` (`backend/server.py`, `register()`) copied `role` from the request body without checking, allowing anyone to self-register as `"admin"`. **Fixed (27 พ.ย. 2569):** `register()` now enforces `SELF_REGISTER_ROLES = {PUBLIC_USER, CURRENT_STUDENT, ALUMNI}` (returning HTTP 403 on `"admin"` or any non-whitelist role) and performs case-insensitive duplicate email checks. Covered by `test_register_blocks_admin_role_escalation` in `backend/tests/test_dorm_api.py`.

## Next steps (prioritised)

1. Deploy latest `dorm` branch commits (pre-serialized gzip cache, register fix, self-serve verification & autopilot moderation) to production.
2. Link `/dorm` from the home page / top bar; agree with the OpenChat admin ("พี่ มศว") on a weekly digest post.
3. Verify estimated building minutes to SWU & photo licensing / partner photos.
4. Monetisation hooks already in data: `featured` (admin pin), `poster_role=owner|agent`,
   and `contact_reveals` per listing (leads to report to room owners).

## Gotchas

- The rooms page fetches up to **300** listings (was 60) so group cards and client filters see everything; raise it or paginate if listings grow beyond that.

- External listing ids are `x` + sha1 prefix of `ext_id`; their `contact` endpoint returns 409 by design. Don't mix external rows into stats that count real posters.

- `GET /api/dorm/listings?ids=` is how saved rooms load; it returns only live listings, so an expired saved id just disappears.
- `GET /api/dorm/mates` returns `hidden_by_gender`; keep it when changing the gender filter.

- Vocabulary (zones, tags, kinds…) is defined **once** in `routes/dorm.py` and served by
  `GET /api/dorm/meta`. Don't duplicate labels in the frontend.
- `match_score` returns `score: 0` (not a low number) when the gender preference fails.
  `/mates` relies on that to drop those profiles for logged-in users.
- `DormShell` (in `DormLayout.jsx`) is the parent route and owns the sign-in sheet and toasts
  (`useShell()`). Pages call `requireLogin(reason, then)`. Don't blank page data on `token`
  change (`setD(null)`), because that unmounts a ContactButton that just revealed a contact.
- `GET /api/dorm/listings` (and building/digest lists) exclude `owner_id`; the detail endpoint
  reads it only to set `is_mine`. Seeding runs once per process and is idempotent (inserts missing
  buildings, backfills new fields, keeps admin edits).
- `frontend/src/pages/dorm/*` must not use `// eslint-disable react-hooks/...`. The repo's
  ESLint config has no react-hooks plugin, and the unknown rule fails the CRA build.

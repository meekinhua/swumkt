# Alumni "สายเทค" — backend contract 2026-11 (WP10 → WP11)

All paths are under `/api`. Auth: the usual Bearer token. **"member"** means the
logged-in user has an alumni profile (`POST /alumni/register` done). Admins pass
every member check, even without a profile. No endpoint here uses an LLM.

Code: `backend/routes/alumni.py` (tree, legacy relations, invites),
`backend/lib/alumni_line_routes.py` (new endpoints), `backend/lib/alumni_service.py`
(trust rules), `backend/lib/alumni_kinship.py` (vocabulary), `backend/lib/alumni_graph.py`
(status machine, cycles, lines). Tests: `backend/tests/test_alumni_2026_11_*.py`.

Errors: a `detail` is a string, or for decisions the UI should handle it is
`{"code": "...", "message": "<Thai>", ...}`. Show `message` when it is there.
Codes the UI should know: `alumni_member_required` (403), `rate_limited` (429),
`similar_ghosts` (409, has `candidates`), `relation_exists` (409), `gen_order` (400),
`cycle` (409), `not_connected` (403), `not_eligible` (403), `decided` (409),
`opted_out` (403), `linked_by_others` (409), `ghost_unavailable` (409),
`gen_mismatch` (400), `guess_first` (409).

---

## 1. Vocabulary (คำเรียกในสายเทค)

Distance means links in the line, not years. **+n** means the other person is n
links above me (senior). **−n** means n links below me (junior).

| distance | m | f | unknown gender (u) |
|---|---|---|---|
| +1 | พี่เทค | พี่เทค | พี่เทค |
| +2 | ลุงเทค | ป้าเทค | ลุง/ป้าเทค |
| +3 | ปู่เทค (maternal variant: ตาเทค) | ย่าเทค (ยายเทค) | ปู่/ย่าเทค (ตา/ยายเทค) |
| +4 | ทวดเทค | ทวดเทค | ทวดเทค |
| +5 | เทียดเทค *(flagged `unverified`)* | เทียดเทค | เทียดเทค |
| +6 and up | fallback `ทวดเทค รุ่นที่ {n}` | | |
| −1 / −2 / −3 / −4 | น้องเทค / หลานเทค / เหลนเทค / โหลนเทค | | |
| −5 and down | fallback `น้องเทค รุ่นที่ {n}` | | |
| 0 | คุณ | | |

* The gender comes from the other person's **`kinship_gender`**. It is optional
  and self-declared on the alumni profile (`"m"` or `"f"`; anything else or
  missing gives the combined form). For a ghost, its creator may set it.
* Layers, with the later one winning: defaults → global override (admin, stored in
  Mongo `alumni_settings{id:"kinship"}`) → **line override**. A line override is
  anchored at a member and applies to that member and everyone below them; the
  nearest anchor up the viewer's primary path wins.
* All terms in API responses are already computed from the viewer's or root's
  point of view, so the UI never needs its own label table.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/alumni/kinship/settings` | logged-in | `{defaults, global_override, my_line_override, effective, ladder[], notes}` |
| PUT | `/alumni/kinship/settings` | admin | partial merge. Body example: `{"up":{"2":{"f":"น้าเทค"}}, "fallback_up":"บรรพบุรุษเทค ชั้น {n}"}`. Add `"_replace": true` to replace the whole override. A rung set to `null` uses the fallback. Returns `{global_override, effective, ladder}`. 400 with a Thai message on bad input |
| PUT | `/alumni/kinship/line-override` | member (own anchor) / admin (`anchor_id`) | e.g. `{"variant":"maternal"}` or `{"up":{"1":"พี่รหัส"}}` |
| DELETE | `/alumni/kinship/line-override[?anchor_id=]` | same | clears the override |
| GET | `/alumni/kinship/term?distance=-2&gender=f` | logged-in | `{term, distance, direction, gender_used, is_fallback, unverified}` |

`ladder` row: `{distance, m, f, u, is_fallback, unverified}`. Rows run from +6 down
to −5; use them for a legend or the admin editor.

---

## 2. Data model and state machines

### Node ids
A real member is their `user_id`. A **ghost** (placeholder) id always starts with
`g_`. Every node object returned (tree nodes, `node` in gaps, prompt ends) has
the same shape:

```json
{"user_id":"g_3a2e…","is_ghost":true,"ghost_status":"active","name":"พี่หมู","nickname":"พี่หมู",
 "student_id":null,"student_id_prefix":"61","gen":61,"role":"unregistered","position":null,
 "company":null,"avatar_hue":137,"avatar_url":null,"verified":false,"gender":"m","created_by":"<uid>"}
```
Real members have the same keys with `is_ghost:false` and real data. A non-member
viewer sees ghosts as `name:"สมาชิกที่ยังไม่ลงทะเบียน"` with `gender`, `created_by`
and `student_id_prefix` set to null.

### Relation (`alumni_relations`, kind `take`)
`from_user_id` is the **junior** (น้องเทค) and `to_user_id` is the **senior** (พี่เทค).
New fields: `junior_ok`, `senior_ok` (true/false/null), `from_is_ghost`, `to_is_ghost`,
`conflict`, `vouch_yes`, `vouch_no`, `decided_by` (`counterpart|crowd|admin|null`), `decided_at`,
`created_by` (the claimant), `source` (`claim|ghost|invite|legacy`), `primary_set_by_junior`,
`merged_from_ghost`, `xp_awarded_to`.

```
claimed ──both ends real & both say yes────────────▶ confirmed
   │ ──≥2 eligible vouches and yes−no ≥ 2──────────▶ vouched ──counterpart says yes──▶ confirmed
   │ ──competing parent claim, or mixed votes─────▶ disputed
   │ ──counterpart says no  /  no ≥2 and yes−no ≤ −2─▶ rejected
   └──ghost removed / merged duplicate────────────▶ removed
```
* **Established** means `confirmed` or `vouched`. Only established links are
  walked in trees, leaderboards and badges. `claimed` and `disputed` links that
  touch the root appear in the tree at distance 1 with `link_status` set, so a
  user can see claims about themselves and answer them.
* **The counterpart's own answer always wins** over votes. After that, voting on
  the link returns 409 `decided`. The claimant cannot "reject" their own claim;
  they delete it instead.
* **Who may vouch:** a registered member who is neither end nor the claimant, and
  who is in the **same cohort** as either end, or within **3 links** of either end
  over established links. One vote per person per link; a vote can be changed.
  Limit: 40 votes a day. +3 XP each for the first 10 votes a day.
* **Conflicts:** a person may have several พี่เทค only when they confirmed each
  link themselves. If two or more different seniors are claimed for one junior and
  any of those links is not confirmed by the junior, each such link (unless
  already `confirmed`) becomes `disputed`. A ghost junior therefore never quietly
  ends up with two parents. Disputes end when the junior answers, a senior
  rejects, the crowd rejects one link (the rest are then re-evaluated), or an admin
  decides.
* **Primary พี่เทค** (drives the vocabulary path and the gaps): the junior's
  explicit choice, then the strongest status, then the most recent decision.
* **Cycles are impossible.** Every new link is checked against all live links
  (claimed, disputed, vouched, confirmed): 409 `cycle`. A merge that would close a
  loop is refused and rolled back.
* **Cohort order:** for new ghost or claim links, the senior's `gen` must be lower
  than the junior's (400 `gen_order`). The legacy `POST /alumni/relations` keeps
  its old lenient behaviour and only checks for cycles.
* Legacy documents are **not migrated**. `status:"pending"` is read as `claimed`.
  `confirmed_by_from` and `confirmed_by_to` are read as junior and senior answers.
  Old confirmed links keep rendering, and the next write fills in the new fields.

### Ghost (`alumni_ghosts`): `active → claimed` (merged) or `active → removed`
Stored fields are only: `display_name` (≤60 characters; text containing an email
or 6+ digits is rejected), `gen`, optional `student_id_prefix` (1–4 digits),
optional `gender`, `created_by`, and timestamps. **No email or phone is ever
stored on a ghost.** A ghost invite is a share link that the member posts (for
example in LINE).

### Ghost claim request (`alumni_ghost_claims`): `pending → approved (merged) | rejected | superseded | cancelled`

### Invite additions
`ghost_id`, `reveal_game`, `clue`, `inviter_term_for_invitee`, `guess_attempts`,
`revealed_at`, `guessed_correctly`, `parent_invite_id`, `inviter_depth`.
Members gain `invited_by`, `invite_id` and `invite_depth` the first time they accept
an invite, and also `kinship_gender` and `interests`.

---

## 3. Endpoints

### 3.1 Changed existing endpoints (existing screens keep working)

| Endpoint | Change |
|---|---|
| `POST /alumni/register`, `PUT /alumni/me` | optional `kinship_gender: "m"\|"f"\|"u"` (`u` clears it) |
| `GET /alumni/tree/me`, `/alumni/tree/{id}` | `relation` now uses the new terms (ลุง/ป้า and so on). Nodes add `term`, `is_ghost`, `relation_id`, `link_status`, `verified_link` and `gender`. The response adds `empty_slots: {up:{distance,term}, down:{distance,term}}` and `vocabulary`. `{id}` may be a ghost id (members only). Ghosts and vouched links appear |
| `POST /alumni/relations` | `take` creates a `claimed` link (it used to be `pending`). It still returns 400 for a duplicate and adds 409 `cycle` |
| `PUT /alumni/relations/{id}/confirm` | **either end** may answer now (before, only the senior could). The counterpart's answer overrides votes and can be changed later. Same as `PUT …/respond` |
| `GET /alumni/relations/pending` | covers claims where I am either end and have not answered yet. Each item adds `my_role` (`senior\|junior`), `other_profile`, `claimed_by`, `term` (what the other person is to me) and a normalised `status`. `from_profile` is kept |
| `GET /alumni/relations/mine` | `status` normalised (`pending` becomes `claimed`) |
| `DELETE /alumni/relations/{id}` | also allowed for the claimant (unless confirmed) and for admins. Also removes the link's votes |
| `POST /alumni/invites` | new optional `ghost_id`, `reveal_game` (default **false**, so the current invite screen keeps working), `clue` (≤140). Default `relation_hint` is now `"น้องเทค"`. Limit: 30 invites a day (429) |
| `GET /alumni/invites/preview/{code}` | **public**. Adds `reveal_game`, `revealed`, `for_ghost` and `ghost_gen`. For a reveal-game invite that is not yet revealed, `inviter` is **null** and you get `clues`, `guesses_left` and `attempts` instead. The inviter's `email` and `student_id` are no longer exposed |
| `POST /alumni/invites/accept/{code}` | records lineage. For a ghost invite it returns `ghost_claim:{ghost_id, display_name, gen, claim_url, invite_code}` and creates **no** automatic link (the ghost's links move over when the person claims it). Adds `reveal_pending`; `inviter_id` is null while the game is unrevealed. The inviter gets XP only once, even under races |
| `GET /alumni/discover/mystery-match` | reasons use the new terms. Ghosts are never returned |
| `GET /alumni/stats` | `connections` counts confirmed and vouched links |

### 3.2 Ghosts and claim-on-arrival

**POST `/alumni/ghosts`** (member). Limits: 10 a day, 60 active per creator.
```json
{"display_name":"พี่หมู","gen":61,"student_id_prefix":"61","gender":"m",
 "attach":{"as":"senior","to":null},"force":false}
```
* `attach.as` describes the **ghost**: `senior` (the ghost is the พี่เทค of `to`)
  or `junior`. `to` defaults to me. Attaching to someone else requires being
  within 3 links of them, or having created that ghost.
* If a similar active ghost exists in the same cohort and `force` is false, you
  get 409 `similar_ghosts` with `candidates` (node objects plus `similarity`).
  Offer "ใช่คนนี้ไหม?" and link the candidate with `POST /alumni/relations/claim`,
  or resend with `force: true`.
* 200 → `{"ghost": <node>, "relation": <relation|null>}`

| Method | Path | Who | Response / notes |
|---|---|---|---|
| GET | `/alumni/ghost-suggestions` | member | `{suggestions:[node+similarity]}`: active ghosts in my cohort whose name is similar to my nickname or full name ("นี่คือคุณใช่ไหม") |
| GET | `/alumni/ghosts/{gid}` | member | `{ghost, relations[], open_invites, can_edit}`. A removed or claimed ghost returns a stub |
| PUT | `/alumni/ghosts/{gid}` | creator / admin | `{display_name?, gen?, student_id_prefix?, gender?}` |
| POST | `/alumni/ghosts/{gid}/remove` | creator (only if no one else has linked to it, otherwise 409 `linked_by_others`) / **the person themself** (`self_identify:true`, limit 3 a day) / admin | `{reason?, self_identify?, do_not_readd?}` → `{ghost_id, status:"removed", relations_removed}`. Identifying fields are erased. `do_not_readd` stores a salted hash so the name and cohort cannot be added again (403 `opted_out`) |
| POST | `/alumni/ghosts/{gid}/invite` | member | `{clue?, reveal_game?=true}` → the invite object (see 3.1). Includes `relation_hint` (what the invitee is to the inviter) and `inviter_term_for_invitee`. `invitee_email` is always null |
| GET | `/alumni/invites/{code}/claim-preview` | logged-in | `{ghost:{id,display_name,gen,student_id_prefix}, links:[{relation_id,status,other:{user_id,nickname,gen,is_ghost},other_is:"senior"\|"junior"}]}`, or `{ghost:null}` |
| POST | `/alumni/ghosts/{gid}/claim` | member | `{invite_code?, confirm_relation_ids?:[], confirm_all?:false}`. **With** the ghost's invite code: merged straight away → `{status:"merged", ghost_id, merged_into, relations[], confirmed[]}`. **Without** it: the cohort must match (400 `gen_mismatch`). Returns `{status:"pending_approval", claim, needs_admin}` and notifies the approvers (the ghost's creator and real members linked to it). Limit: 5 requests a day |
| GET | `/alumni/ghost-claims/pending` | member (admins see all) | `{claims:[{id, ghost_id, ghost:<node>, claimant:{user_id,nickname,name,gen,avatar_url}, …}]}` |
| POST | `/alumni/ghost-claims/{cid}/decide` | approver / admin, never the claimant | `{approve:bool}` → `{status:"merged",…}` or `{status:"rejected"}` |
| POST | `/alumni/admin/ghosts/{gid}/merge-into` | admin | `{target_id}` (a ghost or member), to remove duplicates |

**Merge semantics.** The ghost is locked (`merging`). The system checks for cycles
(a 409 rolls everything back). Links are rewritten in place: the id is kept, so
votes and history follow the link. A link that ends up joining the member to
themself is `removed`. If the member already had the same link, the two are
folded into one: answers are OR-ed, votes are moved with one per voter, and the
duplicate is marked `removed` with `merged_into_relation`. The member's own
earlier votes on links they are now part of are deleted. Statuses and conflicts
are then recomputed, and the ghost is marked `claimed`. Nothing earns XP twice
(`xp_awarded_to`). The merge can be resumed if it is interrupted.

### 3.3 Crowd confirmation

| Method | Path | Who | Body → response |
|---|---|---|---|
| POST | `/alumni/relations/claim` | member | `{junior_id, senior_id}` (either may be a ghost) → relation. Allowed for either end, or a third party within 3 links when **at least one end is a ghost** (third parties can never link two real members). Limit: 20 a day |
| PUT | `/alumni/relations/{id}/respond` | either real end | `{accept}` → relation (the counterpart's answer) |
| POST | `/alumni/relations/{id}/vouch` | eligible member | `{vote:"yes"\|"no"}` → `{relation, vote, changed}` |
| PUT | `/alumni/relations/{id}/primary` | the junior | → relation |
| GET | `/alumni/relations/{id}/history` | member | `{relation, vouches:[{voter:{user_id,nickname},vote,basis,created_at}], events:[audit]}` |
| GET | `/alumni/vouch/prompts?limit=20` | member | `{prompts:[{relation, status, junior:<node>, senior:<node>, claimed_by:{user_id,nickname}, question:"พี่หมู เป็นพี่เทคของ มี่ จริงไหม?", votes:{yes,no,needed:2}}]}`. Disputed prompts come first; links I already voted on are left out |
| PUT | `/alumni/admin/relations/{id}/decide` | admin | `{decision:"confirm"\|"reject"\|"clear"}` |
| GET | `/alumni/admin/audit?target_id=&action=&limit=` | admin | `{items:[{at, actor_id, action, target_type, target_id, meta}]}` |

### 3.4 Gap-driven invite chain

**GET `/alumni/chain/gaps`** (member)
```json
{"up":[
  {"distance":1,"term":"พี่เทค","state":"registered","link_status":"confirmed","path_status":"confirmed","node":{…},"best_inviters":[]},
  {"distance":2,"term":"ลุงเทค","state":"ghost","link_status":"claimed","path_status":"claimed","node":{…},
   "action":"invite_ghost","best_inviters":[{"user_id":"p1","nickname":"พีหนึ่ง","is_me":false}],"open_invites":0},
  {"distance":3,"term":"ปู่/ย่าเทค","state":"missing","headline":"ปู่/ย่าเทคของคุณยังไม่มา",
   "action":"add_ghost_above","best_inviters":[{"user_id":"me","nickname":"มี่","is_me":true}],"hint":"…"}],
 "down":[{"distance":-1,"term":"น้องเทค","state":"missing","headline":"น้องเทคของคุณยังไม่มา",
          "action":"add_or_invite","best_inviters":[{"user_id":"me","nickname":"มี่","is_me":true}]}],
 "line_span_known":3}
```
`action` values:
* `invite_ghost`: share that ghost's invite link. The best inviter is the nearest
  real member below the ghost.
* `add_ghost_above`: the top of my line is a ghost, so add its พี่เทค as a ghost.
* `nudge`: the top is a registered member; send them a nudge, since they know
  their own พี่เทค.
* `add_or_invite`: I am the top or bottom; add a ghost or send an invite.

The path follows primary links, including claimed ones (`path_status` is the
weakest link so far).

**POST `/alumni/chain/nudge`** `{user_id, message?}`. The target must be a
registered member within 6 links of me. Limits: 5 a day, and the same person once
every 3 days. It sends the notification `chain_nudge`.

**GET `/alumni/admin/invite-funnel`** (admin)
```json
{"invites_sent":3,"invites_opened":2,"invites_accepted":2,"open_rate":0.67,"conversion":0.67,
 "inviters":3,"invitees_who_invited":2,"next_level_rate":1.0,"members":4,
 "k_factor":0.5,"k_per_inviter":0.67,"members_by_invite_depth":[{"depth":0,"members":2},{"depth":1,"members":1}],
 "ghost_invites_sent":0,"ghosts_claimed":0,"ghosts_active":0}
```
`k_factor` = accepted invites ÷ members, which equals invites per member ×
conversion.

### 3.5 เฉลยสาย (reveal game)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/alumni/invites/preview/{code}` | public | while unrevealed: `{inviter:null, clues:[{key,label,value}], guesses_left, attempts, relation_hint, reveal_game:true, revealed:false, for_ghost, ghost_gen}` |
| POST | `/alumni/invites/{code}/guess` | public (the code is the secret) | `{guess:"ต้น"}` → `{correct, revealed, guesses_left, clues?}`. Free text matched against the inviter's nickname and name tokens. **At most 3 guesses per invite in total**, then it reveals |
| POST | `/alumni/invites/{code}/reveal` | public | `{give_up?:false}`. Returns 409 `guess_first` until the guess phase ends. Then: `{inviter:<profile without email>, guessed_correctly, inviter_term_for_invitee, line_above_inviter:[{user_id,nickname,gen,is_ghost}], line_size}` |

Clues unlock step by step and **never** include the inviter's id, name, nickname,
avatar, company or email:
* At the start: `gen` (inviter's cohort), `relation` (what the inviter is to me,
  e.g. "พี่เทค"), and `custom` (the inviter's own clue text).
* After 1 wrong guess: also `role` and `line_size`.
* After 2 wrong guesses: also `initial` (first letter of the nickname).

When a link becomes established and the line gains a new rung (up or down),
**every registered member of that line** gets the notification
`kind:"line_new_level"` with `meta.span` (existing `alumni_notifications`, so the
NotificationBell shows it). Other new notification kinds: `mark_request` (now also
sent for third-party claims), `relation_confirmed`, `ghost_claim`,
`ghost_claim_approved`, `ghost_claim_rejected`, `chain_nudge`, `meetup`.

### 3.6 Leaderboards (members only for lines; cached 2 minutes)

* **GET `/alumni/leaderboard/lines?sort=longest|complete|largest&limit=20`** →
  `{sort, lines:[{rank, line_id, top_ids, top:{user_id,nickname,gen,is_ghost}, name:"สายเทคของ…", size, registered, ghosts, span, completeness}], my_line, computed_at}`.
  `complete` only includes lines with size ≥ 3. `completeness` = registered ÷ all
  nodes in the line.
* **GET `/alumni/leaderboard/cohorts`** → `{cohorts:[{gen, registered, ghosts, expected, basis, completion}]}`.
  `basis` is `official_size` when the admin has set a cohort size, otherwise
  `known_members` (registered + ghosts).
* **PUT `/alumni/admin/cohort-sizes`** `{sizes:{"64":120}}` (admin).

The computation loads all established links once and computes lines in memory,
with no per-node queries. The result is cached with `lib/ttl_cache.py` for
2 minutes.

### 3.7 เลี้ยงสาย meetups (member)

| Method | Path | Body / response |
|---|---|---|
| POST | `/alumni/meetups` | `{title, starts_at:"2026-12-20T18:00:00+07:00", place, note?}` → meetup. Limit: 3 a day. Notifies everyone in the line |
| GET | `/alumni/meetups?include_past=false` | `{meetups:[{id,title,starts_at,place,note,created_by,status,counts:{going,maybe,no},my_rsvp,is_owner}]}` |
| POST | `/alumni/meetups/{id}/rsvp` | `{response:"going"\|"maybe"\|"no"}` |
| POST | `/alumni/meetups/{id}/cancel` | creator / admin |

Who can see a meetup: members of the creator's line when it was created, plus
anyone whose current line includes the creator.

### 3.8 Benefits hub

* **GET `/alumni/benefits`** (logged-in) → `{cards:[{id,title,description,link,audience,interest_key,icon,order,active,my_interest?}], interests:{mentor,guest_speaker,judge}}`.
  Cards are filtered by audience (`all`, `alumni` (shown to alumni and staff), or
  `current_student`).
* **PUT `/alumni/benefits`** (admin) `{cards:[…]}` replaces the list. `link` must
  start with `/` or `https://`.
* **PUT `/alumni/benefits/interests`** (member) `{mentor?, guest_speaker?, judge?}`.
* **GET `/alumni/admin/interests?key=mentor`** (admin) → members who opted in,
  with name and email, for the department to contact.

Default cards, used until the admin saves a list:

| Card | Link | Audience |
|---|---|---|
| Research tools | `/market-research` | all |
| Publications | `/publications` | all |
| People | `/people` | all |
| Jobs and referrals | `/alumni/jobs` | all |
| Mentor | interest toggle | alumni |
| Guest speaker | interest toggle | alumni |
| Judge | interest toggle | alumni |

---

## 4. Suggested UX flows (for WP11)

1. **Tree with empty slots.** Render `ancestors` and `descendants` as now. Show
   ghost nodes dashed with a "ยังไม่ลงทะเบียน" chip. Show `link_status`
   `claimed`/`disputed` as a dotted edge with a "รอยืนยัน" or "มีข้อโต้แย้ง" badge,
   and `vouched` as a solid edge with a small "เพื่อนรับรอง" badge. Above the top
   node, draw a dashed card from `empty_slots.up` ("ปู่/ย่าเทคของคุณยังไม่มา"). It
   opens a sheet driven by `GET /chain/gaps`: share a link to LINE (`/ghosts/{id}/invite`),
   add a name (`POST /ghosts` with `attach`), or nudge the relative.
2. **"Who is your พี่เทค?" form.** Fields: name or nickname, cohort, optional
   student-id prefix, optional ลุง/ป้า toggle. Handle 409 `similar_ghosts` with a
   "ใช่คนนี้ไหม?" picker. Put PDPA microcopy under the form: "เก็บเฉพาะชื่อเล่น+รุ่น
   เห็นเฉพาะสมาชิก เจ้าตัวลบได้ทุกเมื่อ".
3. **Vouch prompts.** A card stack from `/vouch/prompts`: "พี่หมูเป็นพี่เทคของมี่จริงไหม?"
   with ใช่ / ไม่ใช่ / ข้าม. Show progress as `votes.yes`/`needed`. Toast "+3 XP".
   Show disputed items first, with a red "ช่วยตัดสิน" header.
4. **Claims about me.** `/relations/pending` with `my_role` and `term`: "มี่บอกว่า
   คุณเป็นพี่เทคของเขา — ใช่ไหม?" Answering uses `PUT …/respond`. Explain that
   your answer counts above votes.
5. **Claim your ghost.** After onboarding, call `/ghost-suggestions` and show "นี่คือ
   คุณใช่ไหม?" cards. Coming from a ghost invite, `accept` returns `ghost_claim`:
   show `claim-preview` links with checkboxes, then `POST /ghosts/{id}/claim`
   with `invite_code` and `confirm_relation_ids`. Without an invite, show the
   "รอสมาชิกในสายยืนยัน" state. Approvers see `/ghost-claims/pending` in the bell
   or tree sidebar.
6. **Reveal game (invite landing page).** If `reveal_game` and not `revealed`: show
   clue cards, a text input "ทายสิใครชวนคุณ?" with up to 3 tries (a new clue
   unlocks per miss), and a "ยอมแพ้ เฉลยเลย" button. Then animate a blur-to-clear
   inviter card plus `line_above_inviter` as a mini chain. Then register or log in
   → accept → claim. For a legacy invite (`reveal_game:false`), keep the current
   screen. Invites from the gap sheet should send `reveal_game:true`.
7. **Leaderboards.** Tabs: สายยาวที่สุด / สายครบที่สุด / สายใหญ่ที่สุด, with "สายของคุณ
   อันดับ N" pinned from `my_line`. A cohort meter ("รุ่น 64 มาแล้ว 43%") from
   `/leaderboard/cohorts`; label `basis:"known_members"` as "จากรายชื่อที่รู้จัก".
8. **Meetups.** A "เลี้ยงสาย" card in the tree sidebar with create, list and RSVP
   chips.
9. **Benefits hub.** A grid of cards. Link cards navigate; interest cards are
   toggles (`PUT /benefits/interests`). Admins edit the list in the admin area.
10. **Settings.** On the profile, a "คำเรียกในสาย: ชาย/หญิง/ไม่ระบุ" control sets
    `kinship_gender`. A line owner can switch ปู่/ย่า ↔ ตา/ยาย
    (`PUT /kinship/line-override {"variant":"maternal"}`). Admin gets a kinship
    term editor driven by `ladder`.

Current UI strings to replace: "พี่ take" becomes "พี่เทค", and "สายตระกูล" should
become "สายเทค" where it refers to the code line.

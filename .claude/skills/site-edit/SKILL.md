---
name: site-edit
description: Operate the live swumkt.org deployment from the command line for the owner — (1) change site content without a deploy (homepage hero, headings, button labels, articles, announcements, faculty profiles, publications; publish, unpublish, pin, undo), (2) switch the platform's paid built-in AI on/off or per feature, and (3) read Conjoint / Brand Equity study results and move AI prompts and answers in and out so the work is done in the user's own LLM. Use whenever the user says things like "แก้หัวข้อหน้าแรก", "เปลี่ยนข้อความ", "เผยแพร่บทความ", "ย้อนกลับ", "ปิด AI ของระบบ", "เปิด AI ของระบบ", "ปิด/เปิดการใช้ AI", "AI ตัวไหนเปิดอยู่", "ดูผล conjoint", "ดูผล brand equity", "ดึง prompt ไปทำ thesis", "เอาคำตอบจาก ChatGPT ใส่กลับเข้าระบบ", "is the site up", "turn the system LLM off", "show me the study results", "export the thesis prompt", "change the heading", "publish that post". Also use when they ask what on the site can be changed without a deploy.
---

# Editing the live site

All of this goes through `backend/scripts/sitectl.py`, which talks to a running
instance over its public API. Nothing here rebuilds or redeploys anything.

```bash
python backend/scripts/sitectl.py --help
```

Target: `--api` or `SWUMKT_API` (default `https://swumkt.org`). The local sim is
`http://localhost:18090` (`python backend/scripts/dev_sim.py` — fake LLM, in-memory data; admin@swu.ac.th / admin1234 for `sitectl login`).

**Credential.** Use a scoped API key, not a login. Set `SWUMKT_API_KEY`, or run
`sitectl use-key` once to store it in `~/.swumkt/credentials.json`. A key does
not expire, carries only the scopes it was minted with (`cms.*` by default; see "Operating the platform" below for the AI switch and research scopes), and can be revoked; a cached login
token carries the owner's full admin rights and dies after 72 hours.

`sitectl whoami` says which credential is in use and what it can reach. If
there is no key yet, someone with server access mints one:

```bash
python backend/scripts/mint_api_key.py --label "sitectl · claude-code"
```

The key is printed once. Never paste it into a file in the repo, a commit, or
a reply — treat it the way you would a password.

## Always

1. **Read before writing.** `landing get <path>` / `text get <path>` so you can
   tell the user what the current text is.
2. **Show the diff with `--dry-run` first** and let the user see it before you
   send anything. Only skip this when they have already approved that exact
   wording.
3. **Never pass `--yes` on the user's behalf** for a change the tool calls
   risky (it blanks a field, removes one, or touches more than six at once).
   Report what it warned about and ask.
4. **Report the read-back, not the write.** The tool re-reads the public URL
   and prints `✓ live` or a warning. "It saved" is not the same as "a visitor
   sees it" — say which one happened.

## Where a given string lives

| The user wants to change | Where it is | Command |
|---|---|---|
| hero headline, lede, slide image, CTA, tool cards, featured picks | the landing document | `landing get` / `landing set` |
| a section heading or button label on /learn, /announcements, /showcase, or the homepage bands | site settings | `text get` / `text set` |
| an article or announcement | the post itself | `post list`, `post set`, `post publish` |
| who wrote an article (the byline) | the post's `author_faculty_ids` | `post set <id> author_faculty_ids '["fac-…"]' --json` |
| a lecturer's profile, research areas, Scholar/Scopus link, photo | the faculty record | `faculty get/set`, `faculty photo` |
| a lecturer's publication list | the papers collection | `paper list/set/publish/hide/add` |

If a string is in neither, it is still compiled into a component. Say so
plainly and offer to wire it to site settings — that part *is* a code change
and a redeploy, but it only has to happen once per string. `frontend/src/hooks/useSiteText.js`
explains the pattern; the key names are free-form.

## Examples

Flags (`--dry-run`, `--yes`, `--json`, `--api`) work either before or after
the subcommand.

```bash
# look first
python backend/scripts/sitectl.py landing get knowledge_hub

# propose
python backend/scripts/sitectl.py --dry-run landing set knowledge_hub.heading "อ่านก่อนใคร"

# apply, after the user agrees
python backend/scripts/sitectl.py landing set knowledge_hub.heading "อ่านก่อนใคร" --yes

# a whole slide list has to be sent whole
python backend/scripts/sitectl.py landing set slides "$(cat slides.json)" --json

# put a string back to the one compiled into the component
python backend/scripts/sitectl.py text unset learn.heading
```

## Faculty and publications

Profiles live at `/people/<slug>`, every paper at `/publications`. They were
seeded from the department page, OpenAlex and ORCID; `memory/FACULTY_SEO_2026_10.md`
explains the sources.

```bash
python backend/scripts/sitectl.py faculty list
python backend/scripts/sitectl.py faculty set intaka-piriyakul links.scholar "https://scholar.google.com/citations?user=…"
python backend/scripts/sitectl.py faculty set poompak-kusawat bio_th "…"
python backend/scripts/sitectl.py faculty photo kanokkan-bunchabusabong portrait.jpg

python backend/scripts/sitectl.py paper list --status review          # held, not public
python backend/scripts/sitectl.py paper set pap-w7215668802 title "…"  # fix a Thai title
python backend/scripts/sitectl.py paper publish pap-w7215668802
python backend/scripts/sitectl.py paper add --faculty poompak-kusawat --title "…" --doi 10.…
```

**Papers held for `review` are real people's academic records that an
automated index got wrong or could not confirm.** Each one carries a
`review_note` saying why. Never publish one because the user asked to "publish
everything": show them the held list with the notes and let them decide item
by item. In particular:

- A Thai title with missing vowel and tone marks is garbled by the index. Do
  not reconstruct it yourself — guessing the exact title of someone's paper is
  inventing a record. Ask for the correct title, or the journal page.
- An ALL-CAPS title with no DOI is usually a student thesis the lecturer
  supervised. It is not their paper unless they say so.

Do not write biographies, research areas or claims about a lecturer that they
or their department have not stated. Use the fields as they are given to you.

## Undo

Every write snapshots the previous document first — landing, posts and site
settings alike (`undo list --doc landing|settings|<post-id>`).

```bash
python backend/scripts/sitectl.py undo list
python backend/scripts/sitectl.py undo list --doc settings
python backend/scripts/sitectl.py undo restore <revision-id>
```

Restoring is itself snapshotted, so it can be undone too. When the user says
"ย้อนกลับ" or "เอาอันเก่าคืน", run `undo list` and show them the entries with
times and labels rather than guessing which one they mean.

## Operating the platform (health, system AI switch, research studies)

Same script, same safety conventions: every write prints a before/after diff first,
`--dry-run` sends nothing, a change that costs money or overwrites a stored result asks
for `--yes`, writes are read back, `--json` prints raw JSON on read commands, and a
credential is never printed.

### One-time setup: a scoped key for the owner's Claude Code session

Someone with server access mints it (the key is shown once; it is **not** in the repo):

```bash
# everything this skill does: content (cms.*) + AI switch + research read/import
python backend/scripts/mint_api_key.py --label "sitectl · owner" --preset operator
# or only the research commands (no content editing, no AI switch):
python backend/scripts/mint_api_key.py --label "sitectl · research" --preset research
```

Then on the machine that runs Claude Code: `export SWUMKT_API_KEY=swk_…` (and `SWUMKT_API=https://swumkt.org`
if not the default), or `python backend/scripts/sitectl.py use-key` once to store it in
`~/.swumkt/credentials.json`. `sitectl whoami` shows what the credential reaches. Never paste the key into
a reply, a file in the repo, or a commit.

| command | scope the key needs |
|---|---|
| `health` | none (public) |
| `llm status` · `llm on/off/set/bypass/hint` | `platform.settings` |
| `research list` · `research show` · `research prompt` | `research.read` |
| `research import` | `research.ai` |
| `landing`/`text`/`post`/`faculty`/`paper`/`undo` | `cms.*` (the original content scopes) |

`--preset operator` = `cms.*` + `platform.settings` + `research.read` + `research.ai`;
`--preset research` = `research.read` + `research.ai`. A key acts as an admin within its scopes, so
**`research.read` reads every user's studies, including respondents' answers and demographics**
(`GET …/responses`, `export-long`, `export/raw`) — hand it out accordingly, and never paste respondent-level
data into a chat LLM; the prompt packs already contain only aggregates. `research.read` cannot write
anything (it also covers the read-only conjoint `POST …/export-thesis/no-ai` and `POST …/simulate`);
`research.ai` is what imports results and the brand-equity code frame (`coding/import-csv`,
`DELETE …/coding`). **A key never spends platform AI money**: it is refused every system-LLM call
whatever the policy says (no admin bypass) — the research commands use the external-LLM path only. If a command answers
`refused: API key '…' lacks the '…' scope`, say which scope is missing and ask; do not look for a way around it.

### Is the site up?

```bash
python backend/scripts/sitectl.py health          # exit 0 only when /api/health says ok
```

### Switch the platform's built-in (paid) AI

The owner does not want to pay for the system LLM by default. With it OFF, every AI feature returns
`409 llm_external_only` and the UI tells users to use their own ChatGPT/Claude/Gemini (copy the prompt,
paste the answer back). Policy = master switch, then per-group / per-feature overrides, plus an optional admin bypass.

```bash
python backend/scripts/sitectl.py llm status                  # master, overrides, effective per group
python backend/scripts/sitectl.py llm off                     # users bring their own LLM (no confirmation)
python backend/scripts/sitectl.py --dry-run llm on            # preview
python backend/scripts/sitectl.py llm on                      # asks: this spends money
python backend/scripts/sitectl.py llm set images off          # group: research thesis images content documents
python backend/scripts/sitectl.py llm set translate on        # or one feature key, e.g. cv.ai, be.thesis
python backend/scripts/sitectl.py llm set translate default   # drop the override
python backend/scripts/sitectl.py llm bypass on|off           # admins may use it even when off (asks: spends money)
python backend/scripts/sitectl.py llm hint "ใช้ ChatGPT/Claude ของคุณเอง แล้ววางผลลัพธ์กลับมา"
```

- **Turning anything ON is the risky direction** (`llm on`, `llm set … on`, `llm set … default` that re-enables
  something, `llm bypass on`): the tool shows the diff and refuses without confirmation. Never pass `--yes` for the
  user — ask first ("ยืนยันเปิด AI ของระบบ ซึ่งจะมีค่าใช้จ่าย?"), then re-run with `--yes` after they agree.
  Turning things OFF and editing the hint need no confirmation.
- Unknown keys are rejected with the list of valid groups/features. Report the read-back line (`✓ written and
  read back`) — the server caches the policy for up to 15 s per worker, so another worker may lag briefly.
- Prompts for the user's own LLM keep working whatever the switch says.

### Conjoint / Brand Equity studies: read results, take prompts out, bring answers in

```bash
python backend/scripts/sitectl.py research list [--tool conjoint|brand-equity] [--json]
python backend/scripts/sitectl.py research show conjoint <study-id>            # status, n, importance, best levels
python backend/scripts/sitectl.py research show brand-equity <study-id>        # status, n, BES composite, alpha, sample
python backend/scripts/sitectl.py research prompt conjoint <study-id> interpretation -o prompt.md
python backend/scripts/sitectl.py research prompt conjoint <study-id> thesis -o thesis-prompts.md   # ch3/ch4/ch5
python backend/scripts/sitectl.py research prompt brand-equity <study-id> analyze|thesis|visual-identity|questions -o p.md
python backend/scripts/sitectl.py research import brand-equity <study-id> analyze --file answer.json --part p1 --model-label "ChatGPT-5"
python backend/scripts/sitectl.py research import conjoint <study-id> thesis --file ch3.md --part ch3 --model-label "Claude"
```

Features: conjoint `interpretation`, `thesis`; brand-equity `analyze`, `thesis`, `visual-identity`, `questions`.
`research prompt` writes ONE Markdown file: instructions, then per part the system prompt and prompt (data already
embedded, identical to what the system LLM would get) — it prints part keys and the matching `import` command. Extra
request fields: `--body '{"method":"mnl"}'` (JSON or `@file`), `--query wave=2` (repeatable).

Workflow for "ดึง prompt ไปทำ thesis": `research list` → `research show` (confirm n and that the numbers look
right) → `research prompt … thesis -o file.md` → give the user the file / paste each part into their own LLM →
save each chapter to a file → `research import … thesis --file ch3.md --part ch3 --model-label "<AI used>"`
(one import per chapter; the exported thesis carries an AI-use disclosure naming that label).

- `research import` replaces the AI result stored for that study part, so it asks for `--yes`; `--dry-run` shows
  size and first line without sending. A 422 prints the server's Thai reason (e.g. truncated JSON, a placeholder
  left in a chapter) — show it to the user rather than retrying blindly.
- Be honest about what the numbers are: only report what `research show` printed. Do not invent statistics, and
  tell the user an AI-written chapter must be checked against the study's tables before submission.
- Customer Value, CMS writing helpers, translate, survey generation etc. have the same external-prompt idea but are
  web-UI features (not scoped to API keys); use the site for those.

## What this tool will not do

`purge`, `landing reset`, and anything under `/admin/*` (that includes `/api/admin/settings` provider keys and
user/role management) are refused twice over:
the client will not send them, and the server refuses them for any API key
whatever its scopes (`HARD_DENY` in `backend/lib/api_keys.py`). They are
unrecoverable, or they are not content. If the user genuinely wants one, say it
has to be done from the admin UI by a signed-in human.

A key also cannot mint or revoke keys, so nothing here can widen its own
access. If a command comes back `refused: API key '…' lacks the '…' scope`,
that is the design working — report it and ask whether they want a wider key,
rather than looking for a way around it.

## When a change does not show up

The backend caches public responses per process for 60–300s and
`sitectl flush` only clears the worker that happens to answer. If the site runs
more than one worker, wait out the TTL rather than reporting failure. The tool
already waits and retries before it reports.

---
name: site-edit
description: Change content on the live swumkt.org deployment — homepage hero, section headings, button labels, articles and announcements — without rebuilding or redeploying. Use whenever the user asks to reword, replace, publish, unpublish, pin or undo anything that appears on the site, in Thai or English ("แก้หัวข้อหน้าแรก", "เปลี่ยนข้อความ", "เผยแพร่บทความ", "ย้อนกลับ", "change the heading", "publish that post"). Also use when they ask what on the site can be changed without a deploy.
---

# Editing the live site

All of this goes through `backend/scripts/sitectl.py`, which talks to a running
instance over its public API. Nothing here rebuilds or redeploys anything.

```bash
python backend/scripts/sitectl.py --help
```

Target: `--api` or `SWUMKT_API` (default `https://swumkt.org`). The local sim is
`http://localhost:18090`.

**Credential.** Use a scoped API key, not a login. Set `SWUMKT_API_KEY`, or run
`sitectl use-key` once to store it in `~/.swumkt/credentials.json`. A key does
not expire, carries only the `cms.*` scopes, and can be revoked; a cached login
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

## What this tool will not do

`purge`, `landing reset`, and anything under `/admin/*` are refused twice over:
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

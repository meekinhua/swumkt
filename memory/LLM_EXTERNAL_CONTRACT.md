# LLM External Contract (plan 2026-11)

Shared contract between backend and frontend agents. Each section is owned by
one work package (see `memory/PLAN_2026_11_EXTERNAL_LLM.md`).

## Policy

_(WP1 — draft; the Python interface below is final and can be coded against now.)_

```python
from lib import llm_policy
llm_policy.init(db)                                   # server.py, once
await llm_policy.require_system_llm("conjoint.interpretation", user)  # HTTPException 409
await llm_policy.is_system_llm_allowed("be.thesis", user) -> bool
llm_policy.SystemLLMDisabled                          # raised by the central guard
llm_policy.FEATURES   # {feature_key: group}
llm_policy.GROUPS     # {group_key: Thai label}
```

`user` may be the server `User` model, a dict with `role`, or omitted (then the
user captured by `get_current_user` for this request is used).

Full semantics, HTTP shapes and dev_sim instructions: see below once finalised.

## Conjoint

_(WP2 fills this section.)_

## Brand Equity

_(WP3 fills this section.)_

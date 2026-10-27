"""PUT /api/projects/{id}/columns/reorder — permission and completeness.

The route sat below `/columns/{column_id}` and was never reached; moving it
above made it live, and it had no permission check and wrote back only the ids
it was sent. A signed-in non-member could erase every column of any project
with `[]`. Reproduced in the sim on 27 Oct 2026 before the fix.

Needs a running server and the seeded admin; skips otherwise.
"""
import os
import uuid

import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
J = {"Content-Type": "application/json"}

pytestmark = pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL not set")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password},
                      timeout=60)
    return r.json().get("access_token") if r.status_code == 200 else None


def _auth(token):
    return {**J, "Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin():
    tok = _login("admin@swu.ac.th", "admin123")
    if not tok:
        pytest.skip("no admin account")
    return tok


@pytest.fixture(scope="module")
def outsider():
    email = f"reorder-probe-{uuid.uuid4().hex[:8]}@example.com"
    requests.post(f"{BASE_URL}/api/auth/register",
                  json={"email": email, "password": "probe-pass-123",
                        "full_name": "Reorder Probe", "role": "current_student"}, timeout=60)
    tok = _login(email, "probe-pass-123")
    if not tok:
        pytest.skip("could not register a non-member user")
    return tok


@pytest.fixture
def project(admin):
    r = requests.post(f"{BASE_URL}/api/projects", json={"name": "reorder test", "description": "x"},
                      headers=_auth(admin), timeout=60)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    for name in ("A", "B", "C"):
        c = requests.post(f"{BASE_URL}/api/projects/{pid}/columns", json={"name": name},
                          headers=_auth(admin), timeout=60)
        assert c.status_code in (200, 201), c.text
    # A new project comes with default columns, so read back all of them —
    # the full set is exactly what a valid reorder has to send.
    ids = _column_ids(admin, pid)
    assert len(ids) >= 3
    yield pid, ids
    requests.delete(f"{BASE_URL}/api/projects/{pid}", headers=_auth(admin), timeout=60)


def _column_ids(admin, pid):
    """Column ids in display order, from GET /projects/{id} → project.columns."""
    r = requests.get(f"{BASE_URL}/api/projects/{pid}", headers=_auth(admin), timeout=60)
    assert r.status_code == 200, r.text
    cols = r.json()["project"].get("columns", [])
    return [c["id"] for c in sorted(cols, key=lambda c: c.get("order", 0))]


def test_a_non_member_cannot_reorder(project, outsider):
    pid, ids = project
    r = requests.put(f"{BASE_URL}/api/projects/{pid}/columns/reorder", json=[],
                     headers=_auth(outsider), timeout=60)
    assert r.status_code == 403


def test_a_non_member_cannot_erase_columns_with_an_empty_list(project, outsider, admin):
    pid, ids = project
    requests.put(f"{BASE_URL}/api/projects/{pid}/columns/reorder", json=[],
                 headers=_auth(outsider), timeout=60)
    assert sorted(_column_ids(admin, pid)) == sorted(ids)


@pytest.mark.parametrize("make", [
    lambda ids: [],                    # erase everything
    lambda ids: ids[:2],               # drop one
    lambda ids: ids + [ids[0]],        # duplicate
    lambda ids: ids[:2] + ["nope"],    # unknown id
])
def test_an_incomplete_or_wrong_list_is_refused_even_for_an_admin(project, admin, make):
    pid, ids = project
    r = requests.put(f"{BASE_URL}/api/projects/{pid}/columns/reorder", json=make(ids),
                     headers=_auth(admin), timeout=60)
    assert r.status_code == 400, r.text


def test_a_full_permutation_reorders(project, admin):
    pid, ids = project
    r = requests.put(f"{BASE_URL}/api/projects/{pid}/columns/reorder", json=list(reversed(ids)),
                     headers=_auth(admin), timeout=60)
    assert r.status_code == 200, r.text
    assert _column_ids(admin, pid) == list(reversed(ids))

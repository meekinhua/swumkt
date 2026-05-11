"""
be_thesis_mermaid.py — Render mermaid code blocks to PNG by shelling out to
`mmdc` (mermaid-cli) which uses headless Chromium.

Public API:
    extract_mermaid_blocks(md) -> List[(block_id, code)]
    render_mermaid_to_png(code) -> bytes (PNG)
    replace_mermaid_blocks_with_markers(md) -> (cleaned_md, blocks)
        Strips mermaid blocks from the markdown so the docx renderer
        doesn't try to display them as code; returns blocks that the
        appendix code can render and embed as figures.
"""
import os
import re
import subprocess
import tempfile
from typing import List, Optional, Tuple


MMDC_BIN = "/opt/mmdc/node_modules/.bin/mmdc"
MMDC_PUPPETEER_CFG = "/opt/mmdc/puppeteer.json"

_MERMAID_FENCE_RE = re.compile(
    r"```(?:mermaid|MermaidJS)\s*\n(.*?)\n```",
    re.DOTALL | re.IGNORECASE,
)


def is_available() -> bool:
    return os.path.exists(MMDC_BIN) and os.path.exists(MMDC_PUPPETEER_CFG)


def extract_mermaid_blocks(md: str) -> List[Tuple[str, str]]:
    """Find all ```mermaid ... ``` fenced blocks. Returns [(block_id, code)]."""
    out: List[Tuple[str, str]] = []
    for i, m in enumerate(_MERMAID_FENCE_RE.finditer(md), start=1):
        code = m.group(1).strip()
        if code:
            out.append((f"M-{i:02d}", code))
    return out


def replace_mermaid_blocks_with_markers(
    md: str, *, marker_prefix: str = "[[MERMAID:",
) -> Tuple[str, List[Tuple[str, str]]]:
    """Replace each mermaid block in markdown with a unique line marker so
    the AI narrative reads as 'see Figure M-01' instead of dumping raw code.
    Returns (cleaned_md, blocks)."""
    blocks: List[Tuple[str, str]] = []

    def _repl(m: re.Match) -> str:
        idx = len(blocks) + 1
        bid = f"M-{idx:02d}"
        blocks.append((bid, m.group(1).strip()))
        return (f"\n\n> **ภาพประกอบ {bid}** — แผนภาพ mermaid "
                f"(ดูในภาคผนวก ก-mermaid)\n\n")

    cleaned = _MERMAID_FENCE_RE.sub(_repl, md)
    return cleaned, blocks


def render_mermaid_to_png(
    code: str, *, theme: str = "default", bg: str = "white",
    width: int = 1400, height: int = 900, timeout: int = 45,
) -> Optional[bytes]:
    """Render a single mermaid block to PNG. Returns None on failure."""
    if not is_available():
        return None
    # mmdc reads from a file, writes to a file
    with tempfile.NamedTemporaryFile("w", suffix=".mmd", delete=False) as inf:
        inf.write(code)
        in_path = inf.name
    out_path = in_path.replace(".mmd", ".png")
    try:
        proc = subprocess.run(
            [
                MMDC_BIN,
                "-i", in_path,
                "-o", out_path,
                "-p", MMDC_PUPPETEER_CFG,
                "-t", theme,
                "-b", bg,
                "-w", str(width),
                "-H", str(height),
            ],
            capture_output=True, text=True, timeout=timeout,
        )
        if proc.returncode != 0:
            # Common failure: syntax error from AI → log and skip
            return None
        if not os.path.exists(out_path):
            return None
        with open(out_path, "rb") as f:
            return f.read()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None
    finally:
        for p in (in_path, out_path):
            try: os.remove(p)
            except Exception: pass

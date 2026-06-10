# -*- coding: utf-8 -*-
"""
Video Downloader PWA — backend
หน้าตาเป็นแอป (PWA ติดตั้งได้) เบื้องหลังใช้ yt-dlp + ffmpeg
รองรับ Facebook / YouTube และทั้งช่อง/เพลย์ลิสต์
"""
import os
import re
import sys
import json
import time
import uuid
import hashlib
import mimetypes
import threading
import subprocess
import webbrowser
import urllib.request
import urllib.parse
from shutil import which
from flask import Response, stream_with_context

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
from flask import Flask, request, jsonify, send_from_directory, send_file, abort

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, "static")
# โฟลเดอร์ staging ของไฟล์ที่กำลังโหลด (client ดูดเข้า IndexedDB แล้วไฟล์จะถูกลบทิ้ง)
# ปรับได้ด้วย env MEEKIN_VIDEO_DIR — ดีฟอลต์: ../video ข้างๆ webapp (พกพาข้ามเครื่องได้)
DEFAULT_DIR = os.environ.get("MEEKIN_VIDEO_DIR") or os.path.normpath(os.path.join(HERE, "..", "video"))
THUMB_DIR = os.path.join(DEFAULT_DIR, ".thumbs")
PORT = int(os.environ.get("PORT", os.environ.get("MEEKIN_PORT", 8787)))

VIDEO_EXT = {".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi", ".flv", ".ts"}
AUDIO_EXT = {".mp3", ".m4a", ".opus", ".ogg", ".wav", ".aac"}

YTDLP = which("yt-dlp") or "yt-dlp"      # หาใน PATH (ติดตั้งด้วย pip/pkg)
FFMPEG = which("ffmpeg")
NODE = which("node")    # JS runtime ให้ yt-dlp ถอดรหัส YouTube (ไม่งั้นหลายคลิปดึงไม่ได้)
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def js_args():
    return ["--js-runtimes", "node"] if NODE else []

app = Flask(__name__, static_folder=None)

JOBS = {}          # id -> dict(state,pct,speed,title,url,file,error)
LOCK = threading.Lock()

# ไฟล์ที่กำลังถูกดาวน์โหลด (live) — ใช้ stream แบบ tail ให้ player เล่นระหว่างโหลด
ACTIVE = {}        # abspath -> {"total": int|None, "done": bool}
ACTIVE_LOCK = threading.Lock()


def active_set(path, **kw):
    ap = os.path.abspath(path)
    with ACTIVE_LOCK:
        ACTIVE.setdefault(ap, {"total": None, "done": False}).update(kw)


def active_get(path):
    ap = os.path.abspath(path)
    with ACTIVE_LOCK:
        d = ACTIVE.get(ap)
        return dict(d) if d else None


# ---------- yt-dlp worker ----------
def build_cmd(url, outdir, quality, whole, live=False):
    cmd = [YTDLP, "--newline", "--no-warnings", *js_args(),
           "--progress-template",
           "DLP|%(progress._percent_str)s|%(progress._speed_str)s|%(info.title)s|%(progress.total_bytes)s|%(progress.downloaded_bytes)s"]
    if whole:
        out_tmpl = os.path.join(outdir, "%(uploader,channel,playlist_title)s",
                                "%(title).80B [%(id)s].%(ext)s")
        cmd += ["--yes-playlist", "--download-archive",
                os.path.join(outdir, "downloaded.txt"), "-o", out_tmpl]
    else:
        out_tmpl = os.path.join(outdir, "%(title).80B [%(id)s].%(ext)s")
        cmd += ["--no-playlist", "-o", out_tmpl]
    if FFMPEG:
        cmd += ["--ffmpeg-location", FFMPEG]
    if live and quality != "mp3":
        # โหมดเล่นสด: พยายามได้ไฟล์ progressive ไฟล์เดียว (สตรีมระหว่างโหลดได้)
        # ถ้าคลิปไม่มี progressive → fallback เป็น best≤720 + รวมเสียง (เล่นได้หลัง merge)
        # --no-part: เขียนลงไฟล์ปลายทางตรงๆ ให้ player สตรีมไฟล์ที่กำลังโตได้ทันที
        # --no-continue/--force-overwrites: เริ่มไฟล์ใหม่เสมอ (กัน 416 จากไฟล์เดิม)
        # --fixup never: ห้ามเขียนไฟล์ทับหลังโหลดจบ (ไม่งั้น stream ที่กำลังเล่นจะพัง)
        # --no-mtime: ไม่ให้ yt-dlp แก้เวลาไฟล์ตอนโหลดจบ (กันการแตะไฟล์ที่กำลังสตรีม)
        cmd += ["--no-part", "--no-continue", "--force-overwrites", "--fixup", "never",
                "--no-mtime", "--merge-output-format", "mp4", "-f",
                "b[acodec!=none][vcodec!=none][ext=mp4]/b[acodec!=none][vcodec!=none]"
                "/bv*[height<=720]+ba/b"]
    elif quality == "best":
        cmd += ["-f", "bv*+ba/b", "--merge-output-format", "mp4"]
    elif quality == "720":
        cmd += ["-f", "bv*[height<=720]+ba/b[height<=720]", "--merge-output-format", "mp4"]
    elif quality == "mp3":
        cmd += ["-x", "--audio-format", "mp3"]
    cmd.append(url)
    return cmd


def to_rel(path):
    """absolute path -> path สัมพัทธ์ใต้ DEFAULT_DIR (สำหรับ /media); คืน '' ถ้าไม่อยู่ใต้โฟลเดอร์"""
    try:
        ap, base = os.path.abspath(path), os.path.abspath(DEFAULT_DIR)
        if os.path.commonpath([ap, base]) == base:
            return os.path.relpath(ap, base).replace("\\", "/")
    except Exception:
        pass
    return ""


def set_job(jid, **kw):
    with LOCK:
        JOBS[jid].update(kw)


def run_job(jid, url, outdir, quality, whole, live=False):
    set_job(jid, state="running")
    cur_file = None
    try:
        cmd = build_cmd(url, outdir, quality, whole, live)
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, encoding="utf-8", errors="replace",
                             creationflags=CREATE_NO_WINDOW, bufsize=1)
        last_err = ""
        for line in p.stdout:
            line = line.rstrip()
            if not line:
                continue
            if line.startswith("DLP|"):
                parts = line.split("|")
                pct = parts[1].strip() if len(parts) > 1 else ""
                spd = parts[2].strip() if len(parts) > 2 else ""
                title = parts[3].strip() if len(parts) > 3 else ""
                total = parts[4].strip() if len(parts) > 4 else ""
                m = re.search(r"([\d.]+)", pct)
                upd = {"pct": float(m.group(1)) if m else 0.0, "speed": spd}
                if title and title != "NA":
                    upd["title"] = title
                set_job(jid, **upd)
                # บันทึกขนาดไฟล์สุดท้ายที่คาดไว้ (ให้ /media รายงาน total ถูกต้องระหว่างโหลด)
                if live and cur_file and total.isdigit():
                    active_set(cur_file, total=int(total))
            else:
                newpath = None
                if "Merging formats into" in line:
                    m = re.search(r'Merging formats into "([^"]+)"', line)
                    if m:
                        newpath = m.group(1)
                elif "Destination:" in line:
                    dest = line.split("Destination:")[-1].strip()
                    # ข้ามไฟล์สตรีมชั่วคราว (เช่น .f137.mp4) ในโหมด merge
                    if not re.search(r"\.f\d+\.\w+$", dest):
                        newpath = dest
                elif "has already been downloaded" in line:
                    m = re.search(r"\]\s+(.+?) has already been downloaded", line)
                    if m:
                        newpath = m.group(1).strip()
                if newpath:
                    set_job(jid, file=newpath, rel=to_rel(newpath))
                    if live:
                        cur_file = newpath
                        active_set(newpath, done=False)
                if "Downloading item" in line or "of playlist" in line:
                    set_job(jid, note=line)
                if line.startswith("ERROR"):
                    last_err = line
        p.wait()
        if cur_file:
            active_set(cur_file, done=True)   # โหลดจบ → /media สลับไปเสิร์ฟแบบไฟล์เต็ม
        if p.returncode == 0:
            set_job(jid, state="done", pct=100.0)
        else:
            set_job(jid, state="error", error=friendly_err(last_err) or f"exit {p.returncode}")
    except Exception as e:
        set_job(jid, state="error", error=str(e))
    finally:
        if cur_file:
            active_set(cur_file, done=True)


def friendly_err(msg):
    """แปลง ERROR ดิบของ yt-dlp เป็นข้อความสั้นที่เข้าใจง่าย"""
    if not msg:
        return ""
    # ตัด prefix "ERROR: [youtube] ID:"
    m = re.sub(r"^ERROR:\s*(\[[^\]]+\]\s*)?([\w-]+:\s*)?", "", msg).strip()
    low = m.lower()
    if "drm" in low:
        return "คลิปนี้มี DRM ดาวน์โหลดไม่ได้ (คอนเทนต์มีลิขสิทธิ์)"
    if "private" in low:
        return "คลิปนี้เป็นวิดีโอส่วนตัว"
    if "not available" in low or "unavailable" in low:
        return "คลิปนี้ไม่พร้อมใช้งาน (อาจถูกลบ/บล็อกภูมิภาค)"
    if "members" in low or "join this channel" in low:
        return "คลิปนี้สำหรับสมาชิกช่องเท่านั้น"
    if "age" in low and "confirm" in low:
        return "คลิปนี้จำกัดอายุ ต้องล็อกอิน"
    if "sign in" in low or "login" in low or "cookies" in low:
        return "คลิปนี้ต้องล็อกอิน YouTube"
    if "requested format is not available" in low:
        return "ไม่มีฟอร์แมตที่ดาวน์โหลดได้สำหรับคลิปนี้"
    return m[:160]


# ---------- static / PWA ----------
@app.route("/")
def index():
    return send_from_directory(STATIC, "index.html")


@app.route("/sw.js")
def sw():
    # ต้องเสิร์ฟที่ราก เพื่อให้ scope ครอบทั้งแอป
    return send_from_directory(STATIC, "sw.js", mimetype="application/javascript")


@app.route("/manifest.webmanifest")
def manifest():
    return send_from_directory(STATIC, "manifest.webmanifest",
                               mimetype="application/manifest+json")


@app.route("/static/<path:fn>")
def static_files(fn):
    return send_from_directory(STATIC, fn)


@app.route("/<path:fn>")
def root_files(fn):
    # icons และไฟล์อื่นที่อ้างจากราก
    if os.path.exists(os.path.join(STATIC, fn)):
        return send_from_directory(STATIC, fn)
    return ("not found", 404)


# ---------- API ----------
@app.route("/api/config")
def api_config():
    return jsonify({"default_dir": DEFAULT_DIR, "ffmpeg": bool(FFMPEG),
                    "ytdlp": bool(YTDLP)})


@app.route("/api/search")
def api_search():
    q = (request.args.get("q") or "").strip()
    try:
        n = max(1, min(30, int(request.args.get("n", 12))))
    except ValueError:
        n = 12
    if not q:
        return jsonify([])
    cmd = [YTDLP, f"ytsearch{n}:{q}", "--dump-json", "--flat-playlist", "--no-warnings", *js_args()]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                             errors="replace", creationflags=CREATE_NO_WINDOW, timeout=45).stdout
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    results = []
    for line in out.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue
        vid = o.get("id")
        if not vid:
            continue
        results.append({
            "id": vid,
            "title": o.get("title") or "(ไม่มีชื่อ)",
            "channel": o.get("channel") or o.get("uploader") or "",
            "duration": o.get("duration") or 0,
            "views": o.get("view_count") or 0,
            "url": o.get("url") or f"https://www.youtube.com/watch?v={vid}",
            "thumb": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
        })
    return jsonify(results)


_YT = {"key": None, "cver": None}


def _yt_innertube():
    if _YT["key"]:
        return _YT["key"], _YT["cver"]
    req = urllib.request.Request("https://www.youtube.com/?hl=en",
                                 headers={"User-Agent": UA, "Accept-Language": "en"})
    html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "replace")
    k = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', html)
    c = re.search(r'"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"', html) or \
        re.search(r'"clientVersion":"([\d.]+)"', html)
    _YT["key"] = k.group(1) if k else ""
    _YT["cver"] = c.group(1) if c else "2.20240101.00.00"
    return _YT["key"], _YT["cver"]


def extract_related(vid):
    """ดึงวิดีโอแนะนำของคลิป vid จาก InnerTube /next → list ของ dict"""
    key, cver = _yt_innertube()
    body = json.dumps({"context": {"client": {"clientName": "WEB", "clientVersion": cver,
                                              "hl": "en", "gl": "US"}}, "videoId": vid}).encode()
    req = urllib.request.Request("https://www.youtube.com/youtubei/v1/next?key=" + key,
                                 data=body, headers={"User-Agent": UA, "Content-Type": "application/json"})
    resp = json.loads(urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace"))
    out, seen = [], set()

    def walk(o):
        if isinstance(o, dict):
            lv = o.get("lockupViewModel")
            if isinstance(lv, dict) and lv.get("contentType") == "LOCKUP_CONTENT_TYPE_VIDEO":
                cid = lv.get("contentId")
                if cid and cid != vid and cid not in seen:
                    seen.add(cid)
                    meta = lv.get("metadata", {}).get("lockupMetadataViewModel", {})
                    title = meta.get("title", {}).get("content", "")
                    parts = []
                    cm = meta.get("metadata", {}).get("contentMetadataViewModel", {})
                    for row in cm.get("metadataRows", []):
                        for p in row.get("metadataParts", []):
                            t = p.get("text", {}).get("content")
                            if t:
                                parts.append(t)
                    out.append({
                        "id": cid, "title": title,
                        "channel": parts[0] if parts else "",
                        "meta": " • ".join(parts[1:]) if len(parts) > 1 else "",
                        "url": f"https://www.youtube.com/watch?v={cid}",
                        "thumb": f"https://i.ytimg.com/vi/{cid}/mqdefault.jpg",
                    })
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(resp)
    return out


def safe_related(vid):
    try:
        return extract_related(vid)
    except Exception:
        return []


@app.route("/api/related")
def api_related():
    vid = (request.args.get("id") or "").strip()
    if not re.fullmatch(r"[\w-]{11}", vid):
        return jsonify([])
    try:
        return jsonify(extract_related(vid))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def library_video_ids():
    """รหัส YouTube ([ID] ในชื่อไฟล์) ของคลิปในคลัง เรียงใหม่สุดก่อน"""
    items = []
    for root, dirs, files in os.walk(DEFAULT_DIR):
        if os.path.basename(root) == ".thumbs":
            dirs[:] = []
            continue
        for fn in files:
            ext = os.path.splitext(fn)[1].lower()
            if ext in VIDEO_EXT or ext in AUDIO_EXT:
                m = re.search(r"\[([\w-]{11})\]", fn)
                if m:
                    try:
                        items.append((os.path.getmtime(os.path.join(root, fn)), m.group(1)))
                    except OSError:
                        pass
    items.sort(reverse=True)
    seen, out = set(), []
    for _, i in items:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


_HOME = {"key": None, "data": None, "ts": 0.0}


@app.route("/api/home")
def api_home():
    # seeds มาจากคลังในเครื่องของ client (ส่งผ่าน ?ids=) — ถ้าไม่มีค่อย fallback คลังเซิร์ฟเวอร์
    ids_param = request.args.get("ids", "")
    if ids_param:
        seeds = [i for i in ids_param.split(",") if re.fullmatch(r"[\w-]{11}", i)][:6]
    else:
        seeds = library_video_ids()[:6]
    if not seeds:
        return jsonify([])
    libset = set(seeds)
    ck = tuple(seeds)
    now = time.time()
    if _HOME["key"] == ck and _HOME["data"] is not None and now - _HOME["ts"] < 600:
        return jsonify(_HOME["data"])
    from concurrent.futures import ThreadPoolExecutor
    import itertools
    with ThreadPoolExecutor(max_workers=6) as ex:
        lists = list(ex.map(safe_related, seeds))
    # สลับเรียงจากหลายเมล็ด (round-robin) เพื่อความหลากหลาย + ตัดที่มีในคลังออก
    seen, feed = set(), []
    for tup in itertools.zip_longest(*lists):
        for item in tup:
            if not item:
                continue
            cid = item["id"]
            if cid in libset or cid in seen:
                continue
            seen.add(cid)
            feed.append(item)
    feed = feed[:48]
    _HOME.update(key=ck, data=feed, ts=now)
    return jsonify(feed)


@app.route("/api/suggest")
def api_suggest():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])
    try:
        url = ("https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=th&q="
               + urllib.parse.quote(q))
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        raw = urllib.request.urlopen(req, timeout=8).read().decode("utf-8", "replace")
        data = json.loads(raw)
        return jsonify(data[1] if isinstance(data, list) and len(data) > 1 else [])
    except Exception:
        return jsonify([])


@app.route("/api/download", methods=["POST"])
def api_download():
    data = request.get_json(force=True)
    urls = [u.strip() for u in data.get("urls", []) if u.strip()]
    quality = data.get("quality", "best")
    whole = bool(data.get("whole", False))
    live = bool(data.get("live", False))
    outdir = (data.get("outdir") or DEFAULT_DIR).strip()
    os.makedirs(outdir, exist_ok=True)
    ids = []
    for url in urls:
        jid = uuid.uuid4().hex[:8]
        with LOCK:
            JOBS[jid] = {"id": jid, "url": url, "state": "queued", "pct": 0.0,
                         "speed": "", "title": "", "file": "", "rel": "", "live": live,
                         "error": "", "note": ""}
        t = threading.Thread(target=run_job, args=(jid, url, outdir, quality, whole, live), daemon=True)
        t.start()
        ids.append(jid)
    return jsonify({"ids": ids})


@app.route("/api/status")
def api_status():
    with LOCK:
        return jsonify(list(JOBS.values()))


@app.route("/api/clear", methods=["POST"])
def api_clear():
    with LOCK:
        for jid in [k for k, v in JOBS.items() if v["state"] in ("done", "error")]:
            del JOBS[jid]
    return jsonify({"ok": True})


@app.route("/api/delete", methods=["POST"])
def api_delete():
    data = request.get_json(force=True, silent=True) or {}
    rel = data.get("rel", "")
    full = safe_under(rel)
    if not os.path.isfile(full):
        return jsonify({"ok": False, "error": "ไม่พบไฟล์"}), 404
    # ลบ thumbnail cache ที่คู่กันด้วย
    try:
        stt = os.stat(full)
        key = hashlib.md5(f"{full}|{stt.st_size}|{int(stt.st_mtime)}".encode("utf-8")).hexdigest()
        tp = os.path.join(THUMB_DIR, key + ".jpg")
        if os.path.isfile(tp):
            os.remove(tp)
    except Exception:
        pass
    try:
        try:
            from send2trash import send2trash      # ลงถังขยะ (กู้คืนได้)
            send2trash(full)
        except ImportError:
            os.remove(full)                         # สำรอง: ลบถาวร
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/purge", methods=["POST"])
def api_purge():
    """ลบไฟล์บนเซิร์ฟเวอร์ถาวร (คืนพื้นที่ดิสก์) หลัง client เก็บลงเครื่องแล้ว"""
    data = request.get_json(force=True, silent=True) or {}
    rel = data.get("rel", "")
    full = safe_under(rel)
    if not os.path.isfile(full):
        return jsonify({"ok": True})
    # ลบ thumbnail cache ที่คู่กัน
    try:
        stt = os.stat(full)
        key = hashlib.md5(f"{full}|{stt.st_size}|{int(stt.st_mtime)}".encode("utf-8")).hexdigest()
        tp = os.path.join(THUMB_DIR, key + ".jpg")
        if os.path.isfile(tp):
            os.remove(tp)
    except Exception:
        pass
    # ลบไฟล์ถาวร (อาจมี handle ค้างชั่วครู่ → ลองซ้ำ)
    for _ in range(4):
        try:
            os.remove(full)
            return jsonify({"ok": True})
        except FileNotFoundError:
            return jsonify({"ok": True})
        except PermissionError:
            time.sleep(0.4)
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": False, "error": "ไฟล์ถูกใช้งานอยู่"}), 423


@app.route("/api/open", methods=["POST"])
def api_open():
    data = request.get_json(force=True, silent=True) or {}
    path = data.get("path") or DEFAULT_DIR
    try:
        if hasattr(os, "startfile"):
            os.startfile(path)                       # Windows
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])         # macOS
        else:
            subprocess.Popen(["xdg-open", path])     # Linux
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ---------- คลังวิดีโอในเครื่อง ----------
def safe_under(rel):
    """แปลง path สัมพัทธ์ให้อยู่ใต้ DEFAULT_DIR เท่านั้น (กัน path traversal)"""
    rel = rel.replace("\\", "/")
    full = os.path.normpath(os.path.join(DEFAULT_DIR, rel))
    if os.path.commonpath([os.path.abspath(full), os.path.abspath(DEFAULT_DIR)]) != os.path.abspath(DEFAULT_DIR):
        abort(403)
    return full


@app.route("/api/files")
def api_files():
    items = []
    for root, dirs, files in os.walk(DEFAULT_DIR):
        if os.path.basename(root) == ".thumbs":
            dirs[:] = []
            continue
        for fn in files:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in VIDEO_EXT and ext not in AUDIO_EXT:
                continue
            full = os.path.join(root, fn)
            try:
                stt = os.stat(full)
            except OSError:
                continue
            rel = os.path.relpath(full, DEFAULT_DIR).replace("\\", "/")
            folder = os.path.dirname(rel)
            items.append({
                "rel": rel,
                "name": os.path.splitext(fn)[0],
                "ext": ext.lstrip("."),
                "kind": "audio" if ext in AUDIO_EXT else "video",
                "folder": folder,
                "size": stt.st_size,
                "mtime": int(stt.st_mtime),
            })
    items.sort(key=lambda x: x["mtime"], reverse=True)
    return jsonify(items)


@app.route("/media/<path:rel>")
def media(rel):
    full = safe_under(rel)
    if not os.path.isfile(full):
        abort(404)
    act = active_get(full)
    if not act or act.get("done"):
        # ไฟล์เต็มแล้ว → เสิร์ฟปกติ (รองรับ Range/seek)
        return send_file(full, conditional=True)

    # ไฟล์กำลังถูกดาวน์โหลด → stream แบบ tail: รายงาน total = ขนาดสุดท้ายที่คาดไว้
    # แล้วรอส่งข้อมูลเพิ่มเมื่อไฟล์โต (กันเบราว์เซอร์จำขนาดผิดแล้วหยุดกลางคัน)
    total = act.get("total")
    cur = os.path.getsize(full)
    if not total or total < cur:
        total = None
    rng = re.match(r"bytes=(\d+)-(\d*)", request.headers.get("Range", "") or "")
    start = int(rng.group(1)) if rng else 0
    if rng and rng.group(2):
        end = int(rng.group(2))
    elif total:
        end = total - 1
    else:
        end = None   # ไม่รู้ปลาย → ส่งจนกว่าจะจบ (chunked)
    ctype = mimetypes.guess_type(full)[0] or "video/mp4"

    def gen():
        with open(full, "rb") as f:
            f.seek(start)
            remaining = (end - start + 1) if end is not None else None
            idle = 0
            while remaining is None or remaining > 0:
                want = 262144 if remaining is None else min(262144, remaining)
                chunk = f.read(want)
                if chunk:
                    if remaining is not None:
                        remaining -= len(chunk)
                    idle = 0
                    yield chunk
                else:
                    a = active_get(full)
                    if not a or a.get("done"):
                        break          # โหลดจบแล้ว ไม่มีข้อมูลเพิ่ม
                    idle += 1
                    if idle > 1200:    # ~120s ไม่มีข้อมูลใหม่ → เลิก
                        break
                    time.sleep(0.1)

    headers = {"Accept-Ranges": "bytes", "Content-Type": ctype, "Cache-Control": "no-store"}
    if total is not None:
        headers["Content-Range"] = f"bytes {start}-{end}/{total}"
        headers["Content-Length"] = str(end - start + 1)
        status = 206
    else:
        status = 200
    return Response(stream_with_context(gen()), status=status, headers=headers)


@app.route("/thumb/<path:rel>")
def thumb(rel):
    full = safe_under(rel)
    if not os.path.isfile(full):
        abort(404)
    ext = os.path.splitext(full)[1].lower()
    if ext in AUDIO_EXT or not FFMPEG:
        abort(404)
    os.makedirs(THUMB_DIR, exist_ok=True)
    stt = os.stat(full)
    key = hashlib.md5(f"{full}|{stt.st_size}|{int(stt.st_mtime)}".encode("utf-8")).hexdigest()
    out = os.path.join(THUMB_DIR, key + ".jpg")
    if not os.path.isfile(out):
        cmd = [FFMPEG, "-y", "-ss", "00:00:02", "-i", full, "-frames:v", "1",
               "-vf", "scale=480:-2", "-q:v", "5", out]
        try:
            subprocess.run(cmd, creationflags=CREATE_NO_WINDOW,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
        except Exception:
            pass
        if not os.path.isfile(out):
            # ลองอีกครั้งที่วินาทีที่ 0 (คลิปสั้นมาก)
            cmd[2] = "00:00:00"
            try:
                subprocess.run(cmd, creationflags=CREATE_NO_WINDOW,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
            except Exception:
                pass
    if os.path.isfile(out):
        return send_file(out, mimetype="image/jpeg")
    abort(404)


def main():
    os.makedirs(DEFAULT_DIR, exist_ok=True)
    host = "0.0.0.0" if "--lan" in sys.argv else "127.0.0.1"   # --lan = ให้มือถือในวง WiFi เข้าได้
    url = f"http://127.0.0.1:{PORT}/"
    # เปิดเบราว์เซอร์ให้อัตโนมัติ (ครั้งแรก)
    if "--no-open" not in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    # ปิด log ของ Flask ให้เงียบ
    import logging
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    app.run(host=host, port=PORT, threaded=True, debug=False)


if __name__ == "__main__":
    main()

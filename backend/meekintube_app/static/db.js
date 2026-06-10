// คลังวิดีโอฝั่งเครื่อง (IndexedDB) — ทำให้ดูออฟไลน์ได้หลังติดตั้ง PWA
// 2 object stores: meta (ข้อมูล + รูปย่อ, เล็ก) / blobs (ไฟล์วิดีโอจริง, ใหญ่)
(() => {
  const DB_NAME = "meekintube", DB_VER = 2;
  let _db = null;

  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "id" });
        if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs");
        if (!d.objectStoreNames.contains("playlists")) d.createObjectStore("playlists", { keyPath: "id" });
      };
      r.onsuccess = () => {
        const d = r.result;
        // ถ้ามีแท็บอื่นขอ upgrade เวอร์ชันใหม่ → ปิด connection นี้ทันที (กัน deadlock)
        d.onversionchange = () => { try { d.close(); } catch {} _db = null; };
        res(d);
      };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error("indexeddb blocked — ปิดแท็บอื่นของแอปแล้วลองใหม่"));
    });
  }
  async function db() { if (!_db) _db = await open(); return _db; }
  function reqP(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

  window.LibDB = {
    // เก็บวิดีโอ 1 รายการ (meta + blob)
    async put(meta, blob) {
      const d = await db();
      return new Promise((res, rej) => {
        const t = d.transaction(["meta", "blobs"], "readwrite");
        t.objectStore("meta").put(meta);
        t.objectStore("blobs").put(blob, meta.id);
        t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    },
    async allMeta() {
      const d = await db();
      const list = await reqP(d.transaction("meta", "readonly").objectStore("meta").getAll());
      list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      return list;
    },
    async getBlob(id) {
      const d = await db();
      return reqP(d.transaction("blobs", "readonly").objectStore("blobs").get(id));
    },
    async has(id) {
      const d = await db();
      const k = await reqP(d.transaction("meta", "readonly").objectStore("meta").getKey(id));
      return k !== undefined;
    },
    async del(id) {
      const d = await db();
      return new Promise((res, rej) => {
        const t = d.transaction(["meta", "blobs"], "readwrite");
        t.objectStore("meta").delete(id);
        t.objectStore("blobs").delete(id);
        t.oncomplete = res; t.onerror = () => rej(t.error);
      });
    },
    async count() {
      const d = await db();
      return reqP(d.transaction("meta", "readonly").objectStore("meta").count());
    },
    async usage() {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        return { usage: e.usage || 0, quota: e.quota || 0 };
      }
      return null;
    },
    // ----- เพลย์ลิสต์ -----
    async plAll() {
      const d = await db();
      const list = await reqP(d.transaction("playlists", "readonly").objectStore("playlists").getAll());
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return list;
    },
    async plGet(id) {
      const d = await db();
      return reqP(d.transaction("playlists", "readonly").objectStore("playlists").get(id));
    },
    async plPut(pl) {
      const d = await db();
      return new Promise((res, rej) => {
        const t = d.transaction("playlists", "readwrite");
        t.objectStore("playlists").put(pl);
        t.oncomplete = res; t.onerror = () => rej(t.error);
      });
    },
    async plDel(id) {
      const d = await db();
      return new Promise((res, rej) => {
        const t = d.transaction("playlists", "readwrite");
        t.objectStore("playlists").delete(id);
        t.oncomplete = res; t.onerror = () => rej(t.error);
      });
    },
  };

  // ขอพื้นที่เก็บแบบถาวร (กันเบราว์เซอร์ลบไฟล์ทิ้งเอง)
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist(); });
  }
})();

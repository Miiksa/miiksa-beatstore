import { getStore } from "@netlify/blobs";

const MAX = 2 * 1024 * 1024; // max bytes per ranged audio response
const CACHE = "public, max-age=31536000, immutable";
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const okId = (s) => /^b\d{6,}$/.test(s || "");
const ab = (u) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);

export async function handle(req, store, pin) {
  const url = new URL(req.url), m = req.method;
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const authed = () => !!pin && req.headers.get("x-admin-pin") === pin;
  const index = async () => (await store.get("index", { type: "json" })) || [];

  // ---------- public ----------
  if (m === "GET" && path === "/beats") return J(await index());

  if (m === "GET" && /^\/(audio|cover)\//.test(path)) {
    const [, kind, id] = path.split("/");
    if (!okId(id)) return J({ error: "Not found" }, 404);
    const key = kind + "/" + id;
    if (kind === "cover") {
      const d = await store.get(key, { type: "arrayBuffer" });
      if (!d) return J({ error: "Not found" }, 404);
      return new Response(d, { headers: { "content-type": "image/jpeg", "cache-control": CACHE } });
    }
    const info = await store.getMetadata(key);
    if (!info) return J({ error: "Not found" }, 404);
    const type = (info.metadata && info.metadata.type) || "audio/mpeg";
    const rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
    if (!rg) {
      const s = await store.get(key, { type: "stream" });
      return new Response(s, { headers: { "content-type": type, "accept-ranges": "bytes", "cache-control": CACHE } });
    }
    const buf = new Uint8Array(await store.get(key, { type: "arrayBuffer" })), total = buf.length;
    const a = rg[1] === "" ? Math.max(0, total - +rg[2]) : +rg[1];
    let b = rg[1] === "" || rg[2] === "" ? total - 1 : Math.min(+rg[2], total - 1);
    b = Math.min(b, a + MAX - 1);
    if (a >= total || a > b) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
    return new Response(buf.slice(a, b + 1), { status: 206, headers: { "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${a}-${b}/${total}`, "cache-control": CACHE } });
  }

  // ---------- producer only ----------
  if (m === "POST" && path === "/login") {
    if (!pin) return J({ error: "ADMIN_PIN is not set in Netlify (Site configuration > Environment variables)." }, 500);
    if (!authed()) { await new Promise((r) => setTimeout(r, 600)); return J({ error: "Wrong PIN. Try again." }, 401); }
    return J({ ok: true });
  }
  if (m !== "POST" && m !== "DELETE") return J({ error: "Not found" }, 404);
  if (!authed()) return J({ error: "Not allowed" }, 401);

  if (m === "POST" && path === "/upload") {
    const id = url.searchParams.get("id"), i = +url.searchParams.get("i");
    if (!okId(id) || !(i >= 0 && i < 200)) return J({ error: "Bad request" }, 400);
    await store.set(`tmp/${id}/${i}`, await req.arrayBuffer());
    return J({ ok: true });
  }

  if (m === "POST" && path === "/beat") {
    const b = await req.json();
    if (!okId(b.id) || !b.title || !(+b.bpm > 0)) return J({ error: "Missing title or BPM" }, 400);
    const e = { id: b.id, title: String(b.title).slice(0, 80), bpm: Math.round(+b.bpm), key: String(b.key || "").slice(0, 20), ext: String(b.ext || "mp3").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "mp3", ts: Date.now(), cover: false };
    if (b.chunks) {
      const n = +b.chunks, parts = []; let len = 0;
      for (let k = 0; k < n; k++) {
        const d = await store.get(`tmp/${b.id}/${k}`, { type: "arrayBuffer" });
        if (!d) return J({ error: "Upload incomplete, try again" }, 400);
        parts.push(new Uint8Array(d)); len += d.byteLength;
      }
      const all = new Uint8Array(len); let o = 0;
      for (const p of parts) { all.set(p, o); o += p.length; }
      await store.set("audio/" + b.id, all.buffer, { metadata: { type: String(b.type || "audio/mpeg") } });
      for (let k = 0; k < n; k++) await store.delete(`tmp/${b.id}/${k}`);
    } else if (/^https?:\/\//.test(b.url || "")) e.url = b.url;
    else return J({ error: "Add an audio file or an audio URL" }, 400);
    const c = /^data:image\/\w+;base64,(.+)$/.exec(b.cover || "");
    if (c) { await store.set("cover/" + b.id, ab(Buffer.from(c[1], "base64"))); e.cover = true; }
    const list = await index(); list.unshift(e);
    await store.setJSON("index", list);
    return J(e);
  }

  if (m === "DELETE" && path === "/beat") {
    const id = url.searchParams.get("id");
    if (!okId(id)) return J({ error: "Bad request" }, 400);
    await store.setJSON("index", (await index()).filter((x) => x.id !== id));
    await store.delete("audio/" + id); await store.delete("cover/" + id);
    return J({ ok: true });
  }
  return J({ error: "Not found" }, 404);
}

export default async (req) => handle(req, getStore("miiksa"), Netlify.env.get("ADMIN_PIN"));
export const config = { path: "/api/*" };

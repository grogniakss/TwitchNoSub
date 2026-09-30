import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseVodId, resolveVod, VodError } from "./twitch.js";
import { buildMasterPlaylist, rewriteMediaPlaylist } from "./playlist.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/+$/, "");
const CACHE_TTL_MS = 10 * 60 * 1000;
const INDEX_HTML = fileURLToPath(new URL("../public/index.html", import.meta.url));
const PLAYLIST_TYPE = "application/vnd.apple.mpegurl";

// vodId -> { expires, promise }. Stores the promise so concurrent requests
// (VLC fetching master + media playlists) share one resolution.
const cache = new Map();

function getVod(vodId) {
    const hit = cache.get(vodId);
    if (hit && hit.expires > Date.now()) return hit.promise;

    const promise = resolveVod(vodId);
    cache.set(vodId, { expires: Date.now() + CACHE_TTL_MS, promise });
    promise.catch(() => cache.delete(vodId));
    return promise;
}

function baseUrl(req) {
    if (PUBLIC_URL) return PUBLIC_URL;
    const proto = req.headers["x-forwarded-proto"]?.split(",")[0].trim() || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
    return `${proto}://${host}`;
}

function linksFor(base, vod, key) {
    const url = key ? `${base}/vod/${vod.id}/${key}.m3u8` : `${base}/vod/${vod.id}.m3u8`;
    return { url, downloadUrl: `${url}?download=1`, vlcUrl: `vlc://${url}` };
}

function fileName(vod, key) {
    return `${vod.channelLogin || "twitch"}_${vod.id}_${key || "auto"}.m3u8`.replace(/[^\w.-]/g, "_");
}

function send(res, status, body, headers = {}) {
    res.writeHead(status, { "Cache-Control": "no-store", ...headers });
    res.end(res.req.method === "HEAD" ? undefined : body);
}

function sendJson(res, status, data) {
    send(res, status, JSON.stringify(data), { "Content-Type": "application/json; charset=utf-8" });
}

function sendPlaylist(res, body, download, name) {
    const headers = { "Content-Type": PLAYLIST_TYPE, "Access-Control-Allow-Origin": "*" };
    if (download) headers["Content-Disposition"] = `attachment; filename="${name}"`;
    send(res, 200, body, headers);
}

async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    const download = url.searchParams.has("download");

    if (path === "/" || path === "/index.html") {
        return send(res, 200, await readFile(INDEX_HTML), { "Content-Type": "text/html; charset=utf-8" });
    }

    if (path === "/api/resolve") {
        const vodId = parseVodId(url.searchParams.get("input"));
        if (!vodId) throw new VodError(400, "Lien invalide. Exemple : https://www.twitch.tv/videos/123456789");

        const vod = await getVod(vodId);
        const base = baseUrl(req);
        return sendJson(res, 200, {
            ...vod,
            auto: linksFor(base, vod),
            qualities: vod.qualities.map(q => ({
                key: q.key,
                label: q.label,
                resolution: q.resolution,
                frameRate: q.frameRate,
                hevc: q.hevc,
                cdnUrl: q.cdnUrl,
                ...linksFor(base, vod, q.key),
            })),
        });
    }

    let match = path.match(/^\/vod\/(\d+)\.m3u8$/);
    if (match) {
        const vod = await getVod(match[1]);
        const base = baseUrl(req);
        const body = buildMasterPlaylist(vod.qualities, key => linksFor(base, vod, key).url);
        return sendPlaylist(res, body, download, fileName(vod));
    }

    match = path.match(/^\/vod\/(\d+)\/([\w]+)\.m3u8$/);
    if (match) {
        const vod = await getVod(match[1]);
        const quality = vod.qualities.find(q => q.key === match[2]);
        if (!quality) throw new VodError(404, "Qualité indisponible pour cette VOD.");

        const upstream = await fetch(quality.cdnUrl, { signal: AbortSignal.timeout(15_000) })
            .catch(err => { throw new VodError(502, `CDN Twitch injoignable (${err.message})`); });
        if (!upstream.ok) throw new VodError(502, `Le CDN Twitch a répondu ${upstream.status}`);

        const body = rewriteMediaPlaylist(await upstream.text(), quality.cdnUrl);
        return sendPlaylist(res, body, download, fileName(vod, quality.key));
    }

    throw new VodError(404, "Page introuvable.");
}

const server = createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method Not Allowed");

    try {
        await handle(req, res);
    } catch (err) {
        const status = err instanceof VodError ? err.status : 500;
        if (status === 500) console.error(err);
        const message = err instanceof VodError ? err.message : "Erreur interne du serveur.";
        if (req.url.startsWith("/api/")) sendJson(res, status, { error: message });
        else send(res, status, message, { "Content-Type": "text/plain; charset=utf-8" });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Twitch VOD -> m3u8 : http://localhost:${PORT}`);
});

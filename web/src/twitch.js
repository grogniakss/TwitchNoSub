// Resolves a Twitch VOD into its CDN playlists.
// Port of the logic in ../../src/patch_amazonworker.js, run server-side.

const GQL_URL = "https://gql.twitch.tv/gql";
const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const FETCH_TIMEOUT_MS = 10_000;

// Highest quality first. Bandwidths are rough real-world values so players
// pick the best variant by default.
export const QUALITIES = [
    { key: "chunked", label: "Source", resolution: null, frameRate: null, bandwidth: 12_000_000 },
    { key: "1440p60", label: "1440p60", resolution: "2560x1440", frameRate: 60, bandwidth: 9_000_000 },
    { key: "1080p60", label: "1080p60", resolution: "1920x1080", frameRate: 60, bandwidth: 6_000_000 },
    { key: "1080p30", label: "1080p30", resolution: "1920x1080", frameRate: 30, bandwidth: 4_500_000 },
    { key: "720p60", label: "720p60", resolution: "1280x720", frameRate: 60, bandwidth: 3_000_000 },
    { key: "720p30", label: "720p30", resolution: "1280x720", frameRate: 30, bandwidth: 2_200_000 },
    { key: "480p30", label: "480p", resolution: "854x480", frameRate: 30, bandwidth: 1_400_000 },
    { key: "360p30", label: "360p", resolution: "640x360", frameRate: 30, bandwidth: 700_000 },
    { key: "160p30", label: "160p", resolution: "284x160", frameRate: 30, bandwidth: 250_000 },
];

const CODEC_H264 = "avc1.4D001E";
const CODEC_HEVC = "hev1.1.6.L93.B0";

export class VodError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Accepts a bare id, "v123", or any twitch.tv / player.twitch.tv URL.
export function parseVodId(input) {
    const text = String(input ?? "").trim();
    if (!text) return null;

    const bare = text.match(/^v?(\d{5,})$/i);
    if (bare) return bare[1];

    let url;
    try {
        url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
        return null;
    }

    if (!/(^|\.)twitch\.tv$/i.test(url.hostname)) return null;

    const path = url.pathname.match(/\/(?:videos|v)\/(\d+)/);
    if (path) return path[1];

    const query = url.searchParams.get("video")?.match(/^v?(\d+)$/i);
    if (query) return query[1];

    return null;
}

async function fetchWithTimeout(url, options = {}) {
    try {
        return await fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
        throw new VodError(502, `Impossible de joindre ${new URL(url).host} (${err.name === "TimeoutError" ? "délai dépassé" : err.message})`);
    }
}

export async function fetchVodMetadata(vodId) {
    const resp = await fetchWithTimeout(GQL_URL, {
        method: "POST",
        headers: {
            "Client-Id": CLIENT_ID,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            query: `query($id: ID!) { video(id: $id) {
                id title broadcastType createdAt lengthSeconds seekPreviewsURL
                previewThumbnailURL(width: 640, height: 360)
                owner { login displayName }
            } }`,
            variables: { id: vodId },
        }),
    });

    if (!resp.ok) throw new VodError(502, `L'API Twitch a répondu ${resp.status}`);

    const data = await resp.json().catch(() => null);
    const video = data?.data?.video;

    if (!video) throw new VodError(404, "VOD introuvable : elle a peut-être été supprimée ou l'ID est incorrect.");
    if (!video.seekPreviewsURL) {
        throw new VodError(422, "Twitch ne fournit pas les infos nécessaires pour cette VOD (seekPreviewsURL manquant).");
    }

    return video;
}

// Builds the candidate index playlist URL for every known quality.
export function buildCandidates(video) {
    const previews = new URL(video.seekPreviewsURL);
    const domain = previews.host;
    const paths = previews.pathname.split("/");
    const specialId = paths[paths.findIndex(p => p.includes("storyboards")) - 1];

    const broadcastType = video.broadcastType.toLowerCase();
    // Same cutoff as the extension: only uploads older than this use the owner/id path.
    const daysBeforeCutoff = (new Date("2023-02-10") - new Date(video.createdAt)) / (1000 * 3600 * 24);

    return QUALITIES.map(quality => {
        let url;
        if (broadcastType === "highlight") {
            url = `https://${domain}/${specialId}/${quality.key}/highlight-${video.id}.m3u8`;
        } else if (broadcastType === "upload" && daysBeforeCutoff > 7) {
            url = `https://${domain}/${video.owner.login}/${video.id}/${specialId}/${quality.key}/index-dvr.m3u8`;
        } else {
            url = `https://${domain}/${specialId}/${quality.key}/index-dvr.m3u8`;
        }
        return { ...quality, cdnUrl: url };
    });
}

// Returns { hevc } if the playlist exists on the CDN, null otherwise.
async function probeQuality(playlistUrl) {
    let resp;
    try {
        resp = await fetchWithTimeout(playlistUrl);
    } catch {
        return null;
    }
    if (!resp.ok) return null;

    const body = await resp.text();
    if (!body.startsWith("#EXTM3U")) return null;

    const initUri = body.match(/#EXT-X-MAP:URI="([^"]+)"/)?.[1];
    if (!initUri) return { hevc: false }; // .ts segments are always H.264

    try {
        const init = await fetchWithTimeout(new URL(initUri, playlistUrl));
        const bytes = init.ok ? Buffer.from(await init.arrayBuffer()).toString("latin1") : "";
        return { hevc: /hev1|hvc1/.test(bytes) };
    } catch {
        return { hevc: false };
    }
}

export async function resolveVod(vodId) {
    const video = await fetchVodMetadata(vodId);
    const candidates = buildCandidates(video);
    const probes = await Promise.all(candidates.map(c => probeQuality(c.cdnUrl)));

    const qualities = candidates
        .map((c, i) => probes[i] && { ...c, hevc: probes[i].hevc, codec: probes[i].hevc ? CODEC_HEVC : CODEC_H264 })
        .filter(Boolean);

    if (qualities.length === 0) {
        const hint = video.broadcastType.toLowerCase() === "upload"
            ? " Les VOD de type « upload » récentes ne sont pas prises en charge par cette méthode."
            : " Le CDN de Twitch a peut-être changé de structure.";
        throw new VodError(502, `Aucune qualité trouvée pour cette VOD.${hint}`);
    }

    return {
        id: video.id,
        title: video.title,
        channel: video.owner?.displayName ?? video.owner?.login ?? "",
        channelLogin: video.owner?.login ?? "",
        broadcastType: video.broadcastType.toLowerCase(),
        createdAt: video.createdAt,
        lengthSeconds: video.lengthSeconds,
        thumbnail: video.previewThumbnailURL,
        qualities,
    };
}

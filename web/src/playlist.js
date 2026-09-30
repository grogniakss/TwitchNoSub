// Playlist generation / rewriting.

function toAbsolute(uri, playlistUrl) {
    // Muted parts of a VOD are listed as "-unmuted" segments that the CDN refuses.
    return new URL(uri.replace(/-unmuted/g, "-muted"), playlistUrl).href;
}

// Makes every segment / init URI absolute so the playlist works when served
// from our own host, and swaps unmuted segments for their muted versions.
export function rewriteMediaPlaylist(body, playlistUrl) {
    return body
        .split(/\r?\n/)
        .map(line => {
            if (!line.trim()) return line;
            if (line.startsWith("#")) {
                return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${toAbsolute(uri, playlistUrl)}"`);
            }
            return toAbsolute(line.trim(), playlistUrl);
        })
        .join("\n");
}

// qualities: resolved qualities (highest first); urlFor(key) -> media playlist URL.
export function buildMasterPlaylist(qualities, urlFor) {
    const lines = ["#EXTM3U"];

    for (const q of qualities) {
        const attrs = [`BANDWIDTH=${q.bandwidth}`, `CODECS="${q.codec},mp4a.40.2"`];
        if (q.resolution) attrs.push(`RESOLUTION=${q.resolution}`);
        if (q.frameRate) attrs.push(`FRAME-RATE=${q.frameRate}.000`);
        lines.push(`#EXT-X-STREAM-INF:${attrs.join(",")}`, urlFor(q.key));
    }

    return lines.join("\n") + "\n";
}

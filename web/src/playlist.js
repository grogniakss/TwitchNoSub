// Playlist generation / rewriting.

// "-unmuted" segments are served by the CDN (with the original audio), so they
// are kept as-is, unlike the extension which swaps them for "-muted" ones.
function toAbsolute(uri, playlistUrl) {
    return new URL(uri, playlistUrl).href;
}

// Makes every segment / init URI absolute so the playlist still points to the
// CDN when saved as a file or served from our own host.
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

// qualities: resolved qualities (highest first); urlFor(quality) -> media playlist URL.
export function buildMasterPlaylist(qualities, urlFor) {
    const lines = ["#EXTM3U"];

    for (const q of qualities) {
        const attrs = [`BANDWIDTH=${q.bandwidth}`, `CODECS="${q.codec},mp4a.40.2"`];
        if (q.resolution) attrs.push(`RESOLUTION=${q.resolution}`);
        if (q.frameRate) attrs.push(`FRAME-RATE=${q.frameRate}.000`);
        lines.push(`#EXT-X-STREAM-INF:${attrs.join(",")}`, urlFor(q));
    }

    return lines.join("\n") + "\n";
}

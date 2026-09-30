// Live check against Twitch: node scripts/check.js <vod id or url>
import { parseVodId, resolveVod } from "../src/twitch.js";
import { rewriteMediaPlaylist } from "../src/playlist.js";

const vodId = parseVodId(process.argv[2]);
if (!vodId) {
    console.error("Usage: npm run check -- <id ou lien de VOD>");
    process.exit(1);
}

try {
    const vod = await resolveVod(vodId);
    console.log(`${vod.channel} — ${vod.title} (${vod.broadcastType})`);

    for (const q of vod.qualities) {
        const playlist = rewriteMediaPlaylist(await (await fetch(q.cdnUrl)).text(), q.cdnUrl);
        const segment = playlist.split("\n").find(l => l.startsWith("https://") && !l.includes("init-"));
        const status = segment ? (await fetch(segment, { method: "HEAD" })).status : "aucun segment";
        console.log(`  ${q.label.padEnd(8)} ${q.hevc ? "HEVC" : "H264"}  premier segment: ${status}`);
    }
} catch (err) {
    console.error(`Échec : ${err.message}`);
    process.exit(1);
}

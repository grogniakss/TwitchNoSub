import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMasterPlaylist, rewriteMediaPlaylist } from "../src/playlist.js";

const CDN = "https://d3stzm2eumvgb4.cloudfront.net/abc_zerator_1_2/chunked/index-dvr.m3u8";

test("rewriteMediaPlaylist makes URIs absolute and keeps unmuted segments", () => {
    const input = [
        "#EXTM3U",
        "#EXT-X-MAP:URI=\"init-0.mp4\"",
        "#EXTINF:10.000,",
        "0.mp4",
        "#EXTINF:10.000,",
        "1-unmuted.ts",
        "",
    ].join("\n");

    const out = rewriteMediaPlaylist(input, CDN).split("\n");
    assert.equal(out[0], "#EXTM3U");
    assert.equal(out[1], "#EXT-X-MAP:URI=\"https://d3stzm2eumvgb4.cloudfront.net/abc_zerator_1_2/chunked/init-0.mp4\"");
    assert.equal(out[2], "#EXTINF:10.000,");
    assert.equal(out[3], "https://d3stzm2eumvgb4.cloudfront.net/abc_zerator_1_2/chunked/0.mp4");
    assert.equal(out[5], "https://d3stzm2eumvgb4.cloudfront.net/abc_zerator_1_2/chunked/1-unmuted.ts");
});

test("rewriteMediaPlaylist handles CRLF and already absolute URLs", () => {
    const out = rewriteMediaPlaylist("#EXTM3U\r\nhttps://other.example/x.ts\r\n", CDN);
    assert.equal(out, "#EXTM3U\nhttps://other.example/x.ts\n");
});

test("buildMasterPlaylist lists each quality", () => {
    const out = buildMasterPlaylist([
        { key: "chunked", bandwidth: 12_000_000, codec: "hev1.1.6.L93.B0", resolution: null, frameRate: null },
        { key: "720p60", bandwidth: 3_000_000, codec: "avc1.4D001E", resolution: "1280x720", frameRate: 60 },
    ], q => `http://h/vod/1/${q.key}.m3u8`);

    assert.equal(out, [
        "#EXTM3U",
        "#EXT-X-STREAM-INF:BANDWIDTH=12000000,CODECS=\"hev1.1.6.L93.B0,mp4a.40.2\"",
        "http://h/vod/1/chunked.m3u8",
        "#EXT-X-STREAM-INF:BANDWIDTH=3000000,CODECS=\"avc1.4D001E,mp4a.40.2\",RESOLUTION=1280x720,FRAME-RATE=60.000",
        "http://h/vod/1/720p60.m3u8",
        "",
    ].join("\n"));
});

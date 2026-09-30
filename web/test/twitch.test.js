import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCandidates, parseVodId, QUALITIES } from "../src/twitch.js";

test("parseVodId accepts ids and Twitch URLs", () => {
    assert.equal(parseVodId("2887271496"), "2887271496");
    assert.equal(parseVodId(" v2887271496 "), "2887271496");
    assert.equal(parseVodId("https://www.twitch.tv/videos/2887271496"), "2887271496");
    assert.equal(parseVodId("https://www.twitch.tv/videos/2887271496?t=1h2m3s"), "2887271496");
    assert.equal(parseVodId("twitch.tv/videos/2887271496"), "2887271496");
    assert.equal(parseVodId("https://m.twitch.tv/videos/2887271496"), "2887271496");
    assert.equal(parseVodId("https://www.twitch.tv/zerator/v/2887271496"), "2887271496");
    assert.equal(parseVodId("https://player.twitch.tv/?video=v2887271496&parent=x"), "2887271496");
});

test("parseVodId rejects anything else", () => {
    assert.equal(parseVodId(""), null);
    assert.equal(parseVodId("hello"), null);
    assert.equal(parseVodId("https://www.twitch.tv/zerator"), null);
    assert.equal(parseVodId("https://evil.example/videos/2887271496"), null);
    assert.equal(parseVodId("https://www.twitch.tv/zerator/clip/SomeClip"), null);
});

const base = {
    id: "2887271496",
    createdAt: "2026-09-29T16:00:17Z",
    owner: { login: "zerator" },
    seekPreviewsURL: "https://d3stzm2eumvgb4.cloudfront.net/376d90de5649dd65de04_zerator_317881557860_1790697612/storyboards/2887271496-info.json",
};

test("buildCandidates builds archive URLs for every quality", () => {
    const c = buildCandidates({ ...base, broadcastType: "ARCHIVE" });
    assert.equal(c.length, QUALITIES.length);
    assert.equal(c[0].key, "chunked");
    assert.equal(c[0].cdnUrl, "https://d3stzm2eumvgb4.cloudfront.net/376d90de5649dd65de04_zerator_317881557860_1790697612/chunked/index-dvr.m3u8");
});

test("buildCandidates handles highlights and old uploads", () => {
    const hl = buildCandidates({ ...base, broadcastType: "HIGHLIGHT" });
    assert.match(hl[0].cdnUrl, /\/chunked\/highlight-2887271496\.m3u8$/);

    const oldUpload = buildCandidates({ ...base, broadcastType: "UPLOAD", createdAt: "2021-01-01T00:00:00Z" });
    assert.match(oldUpload[0].cdnUrl, /cloudfront\.net\/zerator\/2887271496\/376d90de5649dd65de04_zerator_317881557860_1790697612\/chunked\/index-dvr\.m3u8$/);

    const newUpload = buildCandidates({ ...base, broadcastType: "UPLOAD" });
    assert.match(newUpload[0].cdnUrl, /cloudfront\.net\/376d90de5649dd65de04_zerator_317881557860_1790697612\/chunked\/index-dvr\.m3u8$/);
});

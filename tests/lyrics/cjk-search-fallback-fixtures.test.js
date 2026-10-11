import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseBestSyncedLrclibSearchResponse } from '../../src/domain/lyrics/provider-result.js';

/**
 * Fixture captured from the live LRCLIB `/api/search` endpoint on 2026-10-11
 * and curated for the issue #8 scenario: one closest-duration winner, one
 * runner-up with a 1 s duration difference, two duration-gate rejections, and
 * two artist/title decoys. Lyric bodies are truncated to three lines; the
 * unused `lyricsfile` payload is omitted.
 *
 * @typedef {readonly Readonly<Record<string, unknown>>[]} SearchResponse
 */

const searchResponse = /** @type {SearchResponse} */ (readFixture('cjk-search-fallback.json'));

const decoratedAlbumQuery = Object.freeze({
  artist: '周杰伦',
  title: '晴天',
  album: '晴天 - Single',
  durationMs: 270000,
});

describe('CJK search fallback fixture (issue #8 scenario)', () => {
  it('selects the closest-duration synced candidate for a decorated album name', () => {
    const result = parseBestSyncedLrclibSearchResponse(searchResponse, decoratedAlbumQuery);

    expect(result?.kind).toBe('synced');
    if (result?.kind === 'synced') {
      expect(result.track.trackName).toBe('晴天');
      expect(result.track.artistName).toBe('周杰伦');
      expect(result.track.durationMs).toBe(270000);
      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.lines[0]?.text).toBe('故事的小黃花');
    }
  });

  it('selects the same candidate regardless of result ordering', () => {
    const reversed = [...searchResponse].reverse();
    const result = parseBestSyncedLrclibSearchResponse(reversed, decoratedAlbumQuery);

    expect(result?.kind).toBe('synced');
    if (result?.kind === 'synced') {
      expect(result.track.durationMs).toBe(270000);
    }
  });

  it('selects the studio entry when the active track duration matches it exactly', () => {
    const result = parseBestSyncedLrclibSearchResponse(searchResponse, {
      ...decoratedAlbumQuery,
      durationMs: 262000,
    });

    expect(result?.kind).toBe('synced');
    if (result?.kind === 'synced') {
      expect(result.track.durationMs).toBe(262000);
      expect(result.track.albumName).toBe('叶惠美');
    }
  });
});

/**
 * @param {string} filename
 * @returns {unknown}
 */
function readFixture(filename) {
  const url = new URL(`../fixtures/lyrics/${filename}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

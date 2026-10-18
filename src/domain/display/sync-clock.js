/**
 * @typedef {Readonly<{
 *   trackKey: string,
 *   basePositionMs: number,
 *   baseTimestampMs: number,
 *   lastSampledRawMs: number,
 *   playbackStatus: string,
 * }>} SyncedClockState
 *
 * @typedef {Readonly<{
 *   trackKey: string,
 *   rawPositionMs: number,
 *   nowMs: number,
 *   playbackStatus: string,
 * }>} SyncedClockSampleInput
 */

const MAX_STALE_THROTTLE_WINDOW_MS = 10000;

/**
 * Initializes or updates an interpolated clock state based on a new position sample from MPRIS.
 *
 * @param {SyncedClockState | null} state
 * @param {SyncedClockSampleInput} input
 * @returns {SyncedClockState}
 */
export function updateSyncedClock(state, input) {
  const rawPositionMs = Math.max(0, input.rawPositionMs);

  if (state === null || state.trackKey !== input.trackKey) {
    return Object.freeze({
      trackKey: input.trackKey,
      basePositionMs: rawPositionMs,
      baseTimestampMs: input.nowMs,
      lastSampledRawMs: rawPositionMs,
      playbackStatus: input.playbackStatus,
    });
  }

  if (state.playbackStatus !== input.playbackStatus) {
    const currentEstimated = getInterpolatedClockPosition(state, input.nowMs);
    return Object.freeze({
      trackKey: input.trackKey,
      basePositionMs: input.playbackStatus === 'Playing' ? rawPositionMs : currentEstimated,
      baseTimestampMs: input.nowMs,
      lastSampledRawMs: rawPositionMs,
      playbackStatus: input.playbackStatus,
    });
  }

  if (input.playbackStatus === 'Playing') {
    const currentEstimated = getInterpolatedClockPosition(state, input.nowMs);
    const drift = Math.abs(rawPositionMs - currentEstimated);

    // If the player reported the identical raw position while playing, and drift is within
    // the throttle window, the player's MPRIS output is throttled (e.g. Limusic 2s push gate).
    // Maintain the running clock instead of pulling basePositionMs backward.
    if (rawPositionMs === state.lastSampledRawMs && drift < MAX_STALE_THROTTLE_WINDOW_MS) {
      return state;
    }

    // Re-anchor to calibrate for minor drift or jump after seeking.
    return Object.freeze({
      trackKey: input.trackKey,
      basePositionMs: rawPositionMs,
      baseTimestampMs: input.nowMs,
      lastSampledRawMs: rawPositionMs,
      playbackStatus: input.playbackStatus,
    });
  }

  return Object.freeze({
    trackKey: input.trackKey,
    basePositionMs: rawPositionMs,
    baseTimestampMs: input.nowMs,
    lastSampledRawMs: rawPositionMs,
    playbackStatus: input.playbackStatus,
  });
}

/**
 * Calculates the current interpolated playback position in milliseconds.
 *
 * @param {SyncedClockState | null} state
 * @param {number} nowMs
 * @returns {number}
 */
export function getInterpolatedClockPosition(state, nowMs) {
  if (state === null) {
    return 0;
  }

  if (state.playbackStatus !== 'Playing') {
    return state.basePositionMs;
  }

  const elapsed = Math.max(0, nowMs - state.baseTimestampMs);
  return state.basePositionMs + elapsed;
}

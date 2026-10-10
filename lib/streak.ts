/**
 * Screen-streak detection inside the PWA.
 *
 * A "streak" is continuous active time: the tab is visible and you have
 * touched, typed or scrolled at least once every IDLE_RESET_MS. Step away
 * for five minutes and the streak resets. This only sees Side Quest's own
 * tab; the optional watcher/ CLI sees whole-computer activity.
 */

export const IDLE_RESET_MS = 5 * 60 * 1000;
export const DEFAULT_THRESHOLD_MIN = 90;

export interface StreakState {
  sessionStart: number | null;
  lastActive: number | null;
}

export const EMPTY_STREAK: StreakState = { sessionStart: null, lastActive: null };

export function recordActivity(state: StreakState, now: number): StreakState {
  if (state.lastActive === null || state.sessionStart === null || now - state.lastActive > IDLE_RESET_MS) {
    return { sessionStart: now, lastActive: now };
  }
  return { ...state, lastActive: now };
}

export function continuousMinutes(state: StreakState, now: number): number {
  if (state.sessionStart === null || state.lastActive === null) return 0;
  if (now - state.lastActive > IDLE_RESET_MS) return 0;
  return Math.max(0, Math.floor((now - state.sessionStart) / 60000));
}

export function isOverThreshold(state: StreakState, now: number, thresholdMin = DEFAULT_THRESHOLD_MIN): boolean {
  return continuousMinutes(state, now) >= thresholdMin;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

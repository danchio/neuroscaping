// Keeps the screen awake while a view needs it (Screen Wake Lock API: Chrome, Edge, Safari 16.4+; needs HTTPS or localhost).
// The browser drops the lock whenever the tab is hidden, so it is asked for again when the tab comes back.
export const wakeSupported = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/** status is 'on' | 'off' | 'unsupported'. Returns { set(wanted), destroy() }. */
export function wakeLock(onStatus) {
  let sentinel = null, wanted = false, dead = false;
  const status = () => (!wakeSupported() ? 'unsupported' : sentinel ? 'on' : 'off');
  const emit = () => { if (!dead) onStatus(status()); };
  async function acquire() {
    if (!wanted || dead || sentinel || !wakeSupported() || document.visibilityState !== 'visible') return emit();
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!wanted || dead) { s.release().catch(() => {}); return emit(); }
      sentinel = s;
      s.addEventListener('release', () => { if (sentinel === s) sentinel = null; emit(); });
    } catch { sentinel = null; }
    emit();
  }
  const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
  document.addEventListener('visibilitychange', onVis);
  return {
    set(on) {
      wanted = !!on;
      if (wanted) acquire();
      else { const s = sentinel; sentinel = null; if (s) s.release().catch(() => {}); emit(); }
    },
    destroy() { dead = true; wanted = false; document.removeEventListener('visibilitychange', onVis); const s = sentinel; sentinel = null; if (s) s.release().catch(() => {}); },
  };
}

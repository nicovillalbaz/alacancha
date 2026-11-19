type FanView = { id: string; section: string };
const storageKey = 'torneos:public-visits';

export function claimFanView(storage: Pick<Storage, 'getItem' | 'setItem'>, view?: FanView) {
  const seen = new Set<string>(JSON.parse(storage.getItem(storageKey) || '[]'));
  const visit = !seen.has('portal');
  const sectionKey = view && `${view.id}:${view.section}`;
  const tournament = view && sectionKey && !seen.has(sectionKey)
    ? { ...view, first: !seen.has(view.id) }
    : undefined;
  if (!visit && !tournament) return null;
  seen.add('portal');
  if (tournament && sectionKey) {
    seen.add(tournament.id);
    seen.add(sectionKey);
  }
  storage.setItem(storageKey, JSON.stringify([...seen]));
  return { visit, tournament };
}

export function recordFanView(view?: FanView) {
  const path = location.pathname;
  requestAnimationFrame(() => setTimeout(() => {
    if (location.pathname !== path || document.visibilityState !== 'visible' || !navigator.onLine) return;
    try {
      const payload = claimFanView(sessionStorage, view);
      if (!payload) return;
      void fetch('/api/v1/public/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        referrerPolicy: 'no-referrer',
        credentials: 'omit',
        keepalive: true,
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {
      // Without session storage, a reload could count twice.
    }
  }, 0));
}

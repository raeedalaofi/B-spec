// Global toast notifications (achievement unlocks). Appended to <body> so
// they survive screen transitions.

import type { AchievementDef } from '../state/achievements';

function container(): HTMLElement {
  let el = document.getElementById('toasts');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toasts';
    // An achievement unlock is exactly the kind of thing a screen reader
    // should announce, and the container had no live region — the toast
    // appeared, sat for four seconds and left without ever being read out.
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

export function showAchievementToasts(defs: AchievementDef[]): void {
  const host = container();
  defs.forEach((def, i) => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="toast-trophy">🏆</span>
      <span class="toast-body">
        <b>Achievement unlocked</b>
        <span>${def.name}</span>
      </span>`;
    setTimeout(() => {
      host.appendChild(toast);
      setTimeout(() => toast.classList.add('leaving'), 4200);
      setTimeout(() => toast.remove(), 4700);
    }, i * 600);
  });
}

// Shared building blocks for the DOM menu screens.

import type { AppContext, ScreenId } from './screenManager';

export function fmtCr(n: number): string {
  return `${n.toLocaleString('en-US')} Cr.`;
}

export function fmtLapTime(t: number | null): string {
  if (t === null) return '-';
  const m = Math.floor(t / 60);
  return `${m}'${(t - m * 60).toFixed(3).padStart(6, '0')}`;
}

/** standard menu chrome: header with credits + nav, returns content host */
export function menuShell(
  ctx: AppContext,
  title: string,
  opts: { backTo?: ScreenId } = {},
): HTMLElement {
  const gs = ctx.gs!;
  const wrap = document.createElement('div');
  wrap.className = 'menu-screen';
  wrap.innerHTML = `
    <header class="menu-header">
      <div class="menu-header-left">
        ${opts.backTo ? '<button class="btn back-btn" id="menu-back">‹ Back</button>' : ''}
        <h1>${title}</h1>
      </div>
      <div class="menu-header-right">
        <div class="chip"><span class="label">Driver</span><b>${gs.driver.name}</b><i>Lv ${gs.driver.level}</i></div>
        <div class="chip credits"><span class="label">Credits</span><b>${fmtCr(gs.credits)}</b></div>
      </div>
    </header>
    <main class="menu-content"></main>`;
  ctx.root.appendChild(wrap);
  if (opts.backTo) {
    wrap.querySelector('#menu-back')!.addEventListener('click', () => ctx.go(opts.backTo!));
  }
  return wrap.querySelector('.menu-content')!;
}

export function statBars(stats: Record<string, number>): string {
  return Object.entries(stats)
    .map(
      ([k, v]) => `
      <div class="stat-row">
        <span class="label">${k}</span>
        <div class="bar stat-bar"><i style="width:${v}%"></i></div>
        <span class="stat-val">${v}</span>
      </div>`,
    )
    .join('');
}

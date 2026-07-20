import { AI_BY_ID } from '../../data/aidrivers';
import { CARS } from '../../data/cars';
import { CHAMPIONSHIPS, CHAMPIONSHIP_BY_ID, type ChampionshipDef } from '../../data/championships';
import { generateInvitational } from '../../data/invitationals';
import { TRACK_DEFS } from '../../data/tracks';
import { championshipProgress } from '../../state/gameState';
import { standingsOf } from '../../state/progression';
import { fmtCr, fmtLapTime, menuShell } from '../menuCommon';
import type { AppContext } from '../screenManager';

function isUnlocked(ctx: AppContext, champ: ChampionshipDef): boolean {
  if (!champ.unlockAfter) return true;
  return championshipProgress(ctx.gs!, champ.unlockAfter).finished;
}

function invitationalSection(ctx: AppContext): string {
  const gs = ctx.gs!;
  if (!championshipProgress(gs, 'national').champion) return '';
  const inv = generateInvitational(gs.invitationals);
  const track = TRACK_DEFS[inv.trackId];
  const activeCar = gs.activeCarId ? CARS[gs.activeCarId] : null;
  const carOk = activeCar !== null && activeCar.class === 'A';
  return `
    <h2 class="section-title">Invitational Series — Endless</h2>
    <div class="event-card invitational">
      <div class="event-info">
        <b>${inv.name}</b>
        <span class="label">${track.name} · ${inv.laps} laps · elite field</span>
        <span class="champ-progress">Invitationals won: ${gs.invitationals} — prize money grows with your streak</span>
      </div>
      <div class="event-enter">
        <span class="car-price">1st: ${fmtCr(inv.prize[0])}</span>
        <button class="btn primary" id="enter-inv" ${carOk ? '' : 'disabled'}>Enter Race</button>
      </div>
    </div>
    ${carOk ? '' : '<div class="entry-warning">Invitationals require a Class A car.</div>'}`;
}

function championshipList(ctx: AppContext): void {
  const gs = ctx.gs!;
  const content = menuShell(ctx, 'Race Events', { backTo: 'home' });
  content.innerHTML = `<div class="champ-list">${CHAMPIONSHIPS.map((champ) => {
    const progress = championshipProgress(gs, champ.id);
    const unlocked = isUnlocked(ctx, champ);
    const done = Object.keys(progress.completedEvents).length;
    return `
      <button class="champ-card ${unlocked ? '' : 'locked'}" data-champ="${champ.id}" ${unlocked ? '' : 'disabled'}>
        <div class="champ-title">
          <b>${champ.name} ${progress.champion ? '🏆' : ''}</b>
          <span class="label">Class ${champ.allowedClasses.join('/')} · ${champ.events.length} races</span>
        </div>
        <span class="champ-tagline">${champ.tagline}</span>
        <span class="champ-progress">${unlocked ? `${done}/${champ.events.length} raced` : `Complete ${CHAMPIONSHIP_BY_ID[champ.unlockAfter!].name} to unlock`}</span>
      </button>`;
  }).join('')}</div>
  ${invitationalSection(ctx)}`;

  content.querySelectorAll<HTMLButtonElement>('[data-champ]').forEach((btn) =>
    btn.addEventListener('click', () => ctx.go('events', { championshipId: btn.dataset.champ })),
  );
  content
    .querySelector('#enter-inv')
    ?.addEventListener('click', () => ctx.go('race', { invitational: gs.invitationals }));
}

function championshipDetail(ctx: AppContext, champ: ChampionshipDef): void {
  const gs = ctx.gs!;
  const content = menuShell(ctx, champ.name, { backTo: 'home' });
  const progress = championshipProgress(gs, champ.id);
  const activeCar = gs.activeCarId ? CARS[gs.activeCarId] : null;
  const carOk = activeCar !== null && champ.allowedClasses.includes(activeCar.class);
  const aiNames = Object.fromEntries(champ.aiDriverIds.map((id) => [id, AI_BY_ID[id].name]));
  const standings = standingsOf(gs, champ, aiNames);

  content.innerHTML = `
    <button class="btn" id="back-events">‹ All Championships</button>
    ${
      carOk
        ? ''
        : `<div class="entry-warning">Entry requires a Class ${champ.allowedClasses.join(' or ')} car${activeCar ? ` — your ${activeCar.name} is Class ${activeCar.class}` : ' — you own no eligible car'}. Visit the dealership or garage.</div>`
    }
    <div class="events-layout">
      <div>
        <h2 class="section-title">Races</h2>
        <div class="event-list">
          ${champ.events
            .map((ev) => {
              const track = TRACK_DEFS[ev.trackId];
              const outcome = progress.completedEvents[ev.id];
              return `
              <div class="event-card">
                <div class="event-info">
                  <b>${ev.name}</b>
                  <span class="label">${track.name} · ${ev.laps} laps</span>
                  ${outcome ? `<span class="event-best">Best: P${outcome.position} · lap ${fmtLapTime(outcome.bestLapS)}</span>` : ''}
                </div>
                <div class="event-enter">
                  <span class="car-price">1st: ${fmtCr(champ.prize[0])}</span>
                  <button class="btn primary" data-race="${ev.id}" ${carOk ? '' : 'disabled'}>
                    ${outcome ? 'Race Again' : 'Enter Race'}
                  </button>
                </div>
              </div>`;
            })
            .join('')}
        </div>
      </div>
      <div>
        <h2 class="section-title">Standings</h2>
        <table class="results-table standings">
          <thead><tr><th>P</th><th>Driver</th><th>Pts</th></tr></thead>
          <tbody>
            ${standings
              .map(
                (s, i) => `<tr class="${s.isPlayer ? 'player' : ''}">
                  <td class="mono">${i + 1}</td><td>${s.name}</td><td class="mono">${s.points}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
        ${progress.champion ? '<div class="title-banner">🏆 Series Champion</div>' : ''}
      </div>
    </div>`;

  content.querySelector('#back-events')!.addEventListener('click', () => ctx.go('events'));
  content.querySelectorAll<HTMLButtonElement>('[data-race]').forEach((btn) =>
    btn.addEventListener('click', () =>
      ctx.go('race', { championshipId: champ.id, eventId: btn.dataset.race }),
    ),
  );
}

export function eventsScreen(ctx: AppContext, params?: unknown): void {
  const p = params as { championshipId?: string } | undefined;
  const champ = p?.championshipId ? CHAMPIONSHIP_BY_ID[p.championshipId] : null;
  if (champ) championshipDetail(ctx, champ);
  else championshipList(ctx);
}

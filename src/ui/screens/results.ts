// Post-race career results: prize money, B-Spec points breakdown,
// driver level-ups and championship outcome.

import { CHAMPIONSHIP_BY_ID } from '../../data/championships';
import type { RaceRewards } from '../../state/progression';
import type { RaceResult } from '../../sim/types';
import { fmtCr, menuShell } from '../menuCommon';
import type { AppContext } from '../screenManager';

interface ResultsParams {
  championshipId: string;
  eventId: string;
  result: RaceResult;
  rewards: RaceRewards;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export function resultsScreen(ctx: AppContext, params?: unknown): void {
  const { championshipId, result, rewards } = params as ResultsParams;
  const champ = CHAMPIONSHIP_BY_ID[championshipId];
  const content = menuShell(ctx, 'Race Rewards');

  const posClass = rewards.position === 1 ? 'gold' : rewards.position <= 3 ? 'silver' : '';
  content.innerHTML = `
    <div class="rewards-layout">
      <div class="rewards-main">
        <div class="finish-banner ${posClass}">
          <span class="label">${champ.name}</span>
          <b>${ORDINALS[rewards.position - 1] ?? `P${rewards.position}`}</b>
          <span>${rewards.position === 1 ? 'Victory!' : rewards.position <= 3 ? 'Podium finish' : 'Classified'}</span>
        </div>
        ${
          rewards.championshipDecided
            ? `<div class="title-banner big">${
                rewards.wonTitle
                  ? `🏆 ${champ.name} CHAMPION! Title bonus ${fmtCr(rewards.titleBonus)}`
                  : 'Championship concluded — the title goes elsewhere this season.'
              }</div>`
            : ''
        }
        <h3 class="section-title">Earnings</h3>
        <div class="cond-row"><span class="label">Prize money</span><span class="val">${fmtCr(rewards.creditsEarned)}</span></div>
        <h3 class="section-title">B-Spec Points +${rewards.pointsEarned}</h3>
        ${rewards.pointsBreakdown.map((line) => `<div class="points-line">${line}</div>`).join('')}
        ${
          rewards.levelUps.length > 0
            ? `<h3 class="section-title">Driver Development</h3>
              ${rewards.levelUps
                .map(
                  (up) => `<div class="levelup-line">Level ${up.level}! ${up.gains
                    .map((g) => `${g.stat} +${g.amount}`)
                    .join(', ')}</div>`,
                )
                .join('')}`
            : ''
        }
        <div class="results-actions">
          <button class="btn" id="res-home">Home</button>
          <button class="btn primary" id="res-back">Back to ${champ.name}</button>
        </div>
      </div>
      <div>
        <h3 class="section-title">Final Classification</h3>
        <table class="results-table">
          <thead><tr><th>P</th><th>Driver</th><th>Car</th><th>OT</th></tr></thead>
          <tbody>
            ${result.rows
              .map(
                (r) => `<tr class="${r.isPlayer ? 'player' : ''}">
                  <td class="mono">${r.position}</td><td>${r.driverName}</td>
                  <td>${r.carName}</td><td class="mono">${r.overtakes}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  content.querySelector('#res-home')!.addEventListener('click', () => ctx.go('home'));
  content
    .querySelector('#res-back')!
    .addEventListener('click', () => ctx.go('events', { championshipId }));
}

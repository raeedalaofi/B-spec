// In-game modal dialogs, replacing window.alert / window.confirm.
//
// Retiring from a race, abandoning a career and selling a car — the three most
// destructive things you can do — all went through the browser's native
// dialogs. A Chrome confirm box dropped in the middle of a motorsport
// broadcast package breaks the illusion completely, and native dialogs cannot
// be styled, cannot be themed, and look different on every platform.
//
// They also block the JS thread, which for a game running a fixed-timestep
// simulation loop is worse than cosmetic.
//
// This is deliberately small: one function, promise-based, with the focus
// handling that the existing overlays never had — the pit dialog and results
// card are plain divs with no role, no focus trap and no Escape key.

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** styles the confirm button as destructive */
  danger?: boolean;
}

/** Focusable elements inside a container, in tab order. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.hasAttribute('disabled'));
}

/**
 * Show a modal and resolve to the user's answer.
 *
 * Traps Tab inside the dialog, closes on Escape, and returns focus to whatever
 * was focused before it opened — so a keyboard user is never dumped back at
 * the top of the document.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${opts.title}</h2>
        ${opts.body ? `<p>${opts.body}</p>` : ''}
        <div class="modal-actions">
          <button class="btn ghost" data-act="cancel">${opts.cancelLabel ?? 'Cancel'}</button>
          <button class="btn ${opts.danger ? 'danger' : 'primary'}" data-act="ok">${
            opts.confirmLabel ?? 'Confirm'
          }</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = (result: boolean): void => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      previous?.focus?.();
      resolve(result);
    };

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
        return;
      }
      if (e.key !== 'Tab') return;
      // trap: wrap round the ends rather than letting focus escape to the
      // still-visible game behind the overlay
      const items = focusables(overlay);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act) close(act === 'ok');
      else if (e.target === overlay) close(false);
    });

    // the destructive action is never the default focus
    overlay.querySelector<HTMLButtonElement>('[data-act="cancel"]')!.focus();
  });
}

/** Message with a single acknowledgement, replacing window.alert. */
export function alertDialog(title: string, body?: string): Promise<boolean> {
  return confirmDialog({ title, body, confirmLabel: 'OK', cancelLabel: 'Close' });
}

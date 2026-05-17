/**
 * StubScreen — implémentation minimale pour les 15 écrans non encore portés.
 *
 * Affiche un placeholder + heading. Suit le contrat Screen, mountable par
 * le routeur. Les VAGUE ultérieures viendront remplacer ces stubs par les
 * vraies implémentations en gardant la même interface publique.
 *
 * Chaque stub :
 *  - affiche un titre + sous-titre indiquant "Écran X — en cours de portage".
 *  - logge un warning en dev pour signaler qu'on touche un screen non porté.
 *  - se comporte comme un screen complet pour les tests E2E de navigation.
 */
import { BaseScreen } from '@/router/screen';
import type { ScreenId } from '@/types';

export interface StubScreenDeps {
  id: ScreenId;
  title: string;
  subtitle?: string;
}

export class StubScreen extends BaseScreen {
  readonly id: ScreenId;
  private readonly title: string;
  private readonly subtitle: string;

  constructor(deps: StubScreenDeps) {
    super();
    this.id = deps.id;
    this.title = deps.title;
    this.subtitle = deps.subtitle ?? 'Écran en cours de portage (refactor v4.3)';
  }

  protected override onMount(root: HTMLElement): void {
    root.innerHTML = `
      <header class="screen-header">
        <h1>${escapeText(this.title)}</h1>
      </header>
      <section class="placeholder" role="status" aria-live="polite">
        <p>${escapeText(this.subtitle)}</p>
        <small data-screen-id="${escapeAttr(this.id)}">id: ${escapeText(this.id)}</small>
      </section>
    `;
  }

  protected override onActivate(): void {
    console.warn(`[stub-screen] activate ${this.id} — pas encore porté en v4.3`);
  }

  protected override onUnmount(): void {
    if (this.root) this.root.innerHTML = '';
  }
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

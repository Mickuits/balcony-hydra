/**
 * BottomNav — wraps la barre de navigation bottom (5 entries).
 *
 * Responsabilités :
 * - Souscrit à UiStore.currentScreen → highlight l'entry active via
 *   `NAV_OF_SCREEN[currentScreen]`.
 * - Émet un callback `onNavigate(navId)` quand l'utilisateur tap un bouton.
 * - Gère ARIA `aria-current="page"` pour l'accessibilité.
 *
 * Le composant **ne navigue pas lui-même** — il déclare l'intention et
 * laisse le caller (main.ts) router.
 */
import type { NavId, ScreenId } from '@/types';
import type { UiStore } from '@/stores/ui.store';
import { NAV_OF_SCREEN } from '@/router/screen-registry';

export interface BottomNavDeps {
  root: HTMLElement;
  uiStore: UiStore;
  onNavigate: (id: NavId) => void;
}

export class BottomNav {
  private readonly root: HTMLElement;
  private readonly uiStore: UiStore;
  private readonly onNavigate: (id: NavId) => void;
  private unsubscribe: (() => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: BottomNavDeps) {
    this.root = deps.root;
    this.uiStore = deps.uiStore;
    this.onNavigate = deps.onNavigate;
  }

  mount(): void {
    this.clickHandler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-nav]');
      if (!target) return;
      const navId = target.dataset['nav'] as NavId | undefined;
      if (!navId) return;
      this.onNavigate(navId);
    };
    this.root.addEventListener('click', this.clickHandler);

    // Souscription au screen actif pour highlight
    this.unsubscribe = this.uiStore.subscribe((s) => this.highlight(s.currentScreen));
    this.highlight(this.uiStore.get().currentScreen);
  }

  unmount(): void {
    if (this.clickHandler) this.root.removeEventListener('click', this.clickHandler);
    this.clickHandler = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private highlight(currentScreen: ScreenId): void {
    const activeNav = NAV_OF_SCREEN[currentScreen];
    const buttons = this.root.querySelectorAll<HTMLElement>('[data-nav]');
    for (const btn of buttons) {
      const isActive = btn.dataset['nav'] === activeNav;
      btn.classList.toggle('active', isActive);
      if (isActive) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    }
  }
}

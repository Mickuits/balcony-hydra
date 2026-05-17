/**
 * Screen interface — contrat partagé par tous les écrans.
 *
 * Cycle de vie :
 *   1. `mount(root)` — appelée 1× lors de la 1ère activation.
 *      Le screen rend son template + s'abonne aux stores + bind les events.
 *   2. `activate(props?)` — appelée à chaque navigation entrante.
 *      Le screen rafraîchit son état (ex: nouveau pot sélectionné).
 *   3. `deactivate()` — appelée à chaque navigation sortante.
 *      Le screen pause ses timers et nettoie l'état éphémère.
 *   4. `unmount()` — appelée quand le screen est détruit (rare).
 *      Désinscription stores + cleanup complet.
 *
 * Les screens **n'accèdent pas au routeur directement** — la navigation
 * est demandée via callback ou via `uiStore.setScreen()`.
 */
import type { ScreenId } from '@/types';

export interface ScreenProps {
  /** Identifiant utilisé par certains screens (ex: detail → potId). */
  selectedId?: string;
  /** Numéro d'étape pour les wizards. */
  step?: number;
}

export interface Screen {
  readonly id: ScreenId;
  /** Container racine du screen (créé par le routeur si absent). */
  mount(root: HTMLElement): void;
  activate(props?: ScreenProps): void;
  deactivate(): void;
  unmount(): void;
  /** Indique si mount() a déjà été appelé (idempotence). */
  readonly isMounted: boolean;
}

/**
 * Implémentation de base — gère les flags `isMounted` / `isActive` et expose
 * des hooks `onMount` / `onActivate` / `onDeactivate` / `onUnmount` aux
 * sous-classes pour réduire la boilerplate.
 */
export abstract class BaseScreen implements Screen {
  abstract readonly id: ScreenId;
  protected root: HTMLElement | null = null;
  private _isMounted = false;
  private _isActive = false;

  get isMounted(): boolean {
    return this._isMounted;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  mount(root: HTMLElement): void {
    if (this._isMounted) return;
    this.root = root;
    this._isMounted = true;
    this.onMount(root);
  }

  activate(props?: ScreenProps): void {
    if (!this._isMounted) {
      throw new Error(`Screen ${this.id} activated before mount()`);
    }
    if (this._isActive) {
      // Re-activate avec props potentiellement différentes
      this.onActivate(props);
      return;
    }
    this._isActive = true;
    this.onActivate(props);
  }

  deactivate(): void {
    if (!this._isActive) return;
    this._isActive = false;
    this.onDeactivate();
  }

  unmount(): void {
    if (!this._isMounted) return;
    if (this._isActive) this.deactivate();
    this.onUnmount();
    this._isMounted = false;
    this.root = null;
  }

  // Hooks à override par les sous-classes — vides par défaut.
  protected onMount(_root: HTMLElement): void {}
  protected onActivate(_props?: ScreenProps): void {}
  protected onDeactivate(): void {}
  protected onUnmount(): void {}
}

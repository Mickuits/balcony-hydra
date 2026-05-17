/**
 * Router — orchestrateur de navigation entre les 16 screens.
 *
 * Caractéristiques :
 * - Registre `Map<ScreenId, Screen>` injecté à la construction.
 * - Lazy mount : un screen n'est `mount()` qu'à sa 1ère activation
 *   → réduit le coût mémoire/DOM au boot.
 * - Pas de hash URL (PWA full-screen) — le state actif vit dans UiStore.
 * - Synchronise UiStore.currentScreen avec la navigation.
 * - Toggle CSS `[hidden]` sur les conteneurs (le shell HTML est minimal,
 *   1 container par screen pré-créé dans `index.html`).
 *
 * Pas de DOM hardcoded : le routeur reçoit en deps une `containerResolver`
 * (id → HTMLElement) → testable sans markup réel.
 */
import type { ScreenId } from '@/types';
import type { Screen, ScreenProps } from './screen';
import type { UiStore } from '@/stores/ui.store';

export type ContainerResolver = (id: ScreenId) => HTMLElement | null;

export interface RouterDeps {
  screens: Map<ScreenId, Screen>;
  resolveContainer: ContainerResolver;
  uiStore: UiStore;
  /** Premier screen à afficher au boot (par défaut dashboard). */
  initialScreen?: ScreenId;
}

export class Router {
  private readonly screens: Map<ScreenId, Screen>;
  private readonly resolveContainer: ContainerResolver;
  private readonly uiStore: UiStore;
  private currentScreen: ScreenId | null = null;

  constructor(deps: RouterDeps) {
    this.screens = deps.screens;
    this.resolveContainer = deps.resolveContainer;
    this.uiStore = deps.uiStore;
  }

  /** Navigue vers le screen demandé. Sync UiStore. */
  navigate(id: ScreenId, props?: ScreenProps): void {
    if (!this.screens.has(id)) {
      throw new Error(`Router: screen "${id}" introuvable dans le registre`);
    }
    if (this.currentScreen === id) {
      // Re-activate avec nouveaux props (utile pour wizards)
      this.screens.get(id)?.activate(props);
      return;
    }

    // Désactivation de l'écran courant
    if (this.currentScreen !== null) {
      const prev = this.screens.get(this.currentScreen);
      prev?.deactivate();
      const prevContainer = this.resolveContainer(this.currentScreen);
      if (prevContainer) prevContainer.hidden = true;
    }

    // Activation du nouveau
    const screen = this.screens.get(id)!;
    const container = this.resolveContainer(id);
    if (!container) {
      throw new Error(`Router: container HTML manquant pour "${id}"`);
    }
    if (!screen.isMounted) {
      screen.mount(container);
    }
    container.hidden = false;
    screen.activate(props);

    this.currentScreen = id;
    this.uiStore.setScreen(id);
  }

  /** ID du screen actif (null tant que `navigate()` n'a pas été appelé). */
  getCurrent(): ScreenId | null {
    return this.currentScreen;
  }

  /** Désactive l'écran courant + démonte tout (utile pour les tests). */
  dispose(): void {
    if (this.currentScreen !== null) {
      this.screens.get(this.currentScreen)?.deactivate();
    }
    for (const screen of this.screens.values()) {
      screen.unmount();
    }
    this.currentScreen = null;
  }
}

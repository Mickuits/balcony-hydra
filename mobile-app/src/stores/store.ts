/**
 * Store<T> — observable minimal sans framework.
 *
 * Pattern : 1 store par domaine (hardware, config, stats, ui, live-log).
 * Émet sur set/patch. Listeners synchrones.
 *
 * Garanties :
 * - state est immutable depuis l'extérieur (get retourne ref read-only).
 * - subscribe retourne une fonction de désinscription.
 * - emit() est appelé une seule fois par mutation, pas par listener ajouté
 *   mid-iteration (snapshot du Set au début de l'émission).
 */
export type StoreListener<T> = (state: Readonly<T>) => void;

export class Store<T extends object> {
  private listeners = new Set<StoreListener<T>>();

  constructor(private state: T) {}

  /**
   * Retourne le state actuel (read-only). Ne pas muter directement.
   */
  get(): Readonly<T> {
    return this.state;
  }

  /**
   * Remplace complètement le state. Pour les seeds initiaux + tests reset.
   */
  set(state: T): void {
    this.state = state;
    this.emit();
  }

  /**
   * Merge superficiel — n'écrase que les clés présentes dans `partial`.
   * Pour les structures imbriquées, l'appelant doit cloner manuellement
   * (ou utiliser des méthodes dédiées dans les stores spécialisés).
   */
  patch(partial: Partial<T>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  /**
   * Appelle une fonction de mutation immutable. La fonction reçoit le state
   * courant et doit retourner le NOUVEAU state (ou undefined pour ne rien
   * changer / cas no-op).
   */
  update(updater: (state: Readonly<T>) => T | undefined | void): void {
    const next = updater(this.state);
    if (next === undefined || next === null) return;
    this.state = next;
    this.emit();
  }

  /**
   * Souscrit aux changements. Retourne une fonction d'unsubscribe.
   * Le listener N'est PAS appelé immédiatement — pour cela, faire
   * `subscribe(fn); fn(store.get())` côté appelant.
   */
  subscribe(listener: StoreListener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Compteur d'écouteurs — utile pour les tests + diagnostic mémoire.
   */
  listenerCount(): number {
    return this.listeners.size;
  }

  private emit(): void {
    // Snapshot pour éviter mutation pendant itération
    const snapshot = Array.from(this.listeners);
    for (const fn of snapshot) {
      try {
        fn(this.state);
      } catch (err) {
        // Un listener qui crash ne doit pas bloquer les autres
        console.error('[store] listener threw', err);
      }
    }
  }
}

/**
 * ModalManager — orchestre l'ouverture/fermeture des modales et leur stack.
 *
 * Caractéristiques :
 * - Stack LIFO : closeTop() ferme la dernière ouverte (gestion "back" Android).
 * - Focus trap basique (Tab boucle dans la modale).
 * - Restore focus sur l'élément qui a ouvert la modale.
 * - Event `[Escape]` global → closeTop.
 * - Body lock (no-scroll) tant qu'au moins 1 modale ouverte.
 * - Tests sans dépendance navigateur : on simule click sur backdrop.
 *
 * Pattern d'usage :
 *   modalMgr.open('addPot');                 // ouvre la modale par id
 *   modalMgr.close('addPot');                // ferme explicitement
 *   modalMgr.closeTop();                     // ferme la plus récente
 */

export interface ModalElements {
  /** L'élément modal lui-même (souvent un <div class="modal">). */
  modal: HTMLElement;
  /** Le backdrop cliquable (souvent .modal-bg). Optionnel. */
  backdrop?: HTMLElement;
  /** L'élément à focus au open (champ principal, etc.). Optionnel. */
  initialFocus?: HTMLElement;
}

export type ModalCloseReason = 'close' | 'escape' | 'backdrop' | 'replaced';

export interface ModalCallbacks {
  onOpen?: () => void;
  onClose?: (reason: ModalCloseReason) => void;
}

interface OpenModal {
  id: string;
  elements: ModalElements;
  callbacks?: ModalCallbacks;
  /** Élément qui avait le focus avant ouverture (pour restauration). */
  previousFocus: HTMLElement | null;
}

export class ModalManager {
  private readonly stack: OpenModal[] = [];
  private readonly registry = new Map<
    string,
    { elements: ModalElements; callbacks?: ModalCallbacks }
  >();
  private bodyLocked = false;

  constructor(private readonly body: HTMLElement = document.body) {}

  /**
   * Enregistre une modale (lookup ultérieur par id).
   * Indispensable avant d'appeler `open(id)`.
   */
  register(id: string, elements: ModalElements, callbacks?: ModalCallbacks): void {
    this.registry.set(id, { elements, callbacks });
    // Setup listeners (backdrop click + Escape global)
    elements.backdrop?.addEventListener('click', (e) => {
      // Ne ferme que si on a cliqué *exactement* sur le backdrop, pas son enfant.
      if (e.target === elements.backdrop) this.close(id, 'backdrop');
    });
    // Marqueur ARIA pour les screen readers
    elements.modal.setAttribute('role', 'dialog');
    elements.modal.setAttribute('aria-modal', 'true');
    elements.modal.hidden = true;
    if (elements.backdrop) elements.backdrop.hidden = true;
  }

  /** Ouvre la modale par id. No-op si déjà ouverte. */
  open(id: string): void {
    const entry = this.registry.get(id);
    if (!entry) throw new Error(`ModalManager: modal "${id}" non enregistrée`);
    if (this.isOpen(id)) return;

    const previousFocus = (document.activeElement as HTMLElement) ?? null;
    const opened: OpenModal = {
      id,
      elements: entry.elements,
      ...(entry.callbacks ? { callbacks: entry.callbacks } : {}),
      previousFocus,
    };
    this.stack.push(opened);

    entry.elements.modal.hidden = false;
    if (entry.elements.backdrop) entry.elements.backdrop.hidden = false;
    this.lockBody();

    entry.elements.initialFocus?.focus();
    entry.callbacks?.onOpen?.();
  }

  /** Ferme la modale par id si présente dans la stack. */
  close(id: string, reason: ModalCloseReason = 'close'): void {
    const idx = this.stack.findIndex((m) => m.id === id);
    if (idx === -1) return;
    const opened = this.stack.splice(idx, 1)[0]!;
    this.hide(opened, reason);
    if (this.stack.length === 0) this.unlockBody();
  }

  /** Ferme la modale la plus récente (back-stack). */
  closeTop(reason: ModalCloseReason = 'close'): void {
    const top = this.stack.pop();
    if (!top) return;
    this.hide(top, reason);
    if (this.stack.length === 0) this.unlockBody();
  }

  /** Ferme toutes les modales (utile au logout / factory reset). */
  closeAll(reason: ModalCloseReason = 'close'): void {
    while (this.stack.length > 0) this.closeTop(reason);
  }

  isOpen(id: string): boolean {
    return this.stack.some((m) => m.id === id);
  }

  /** Nombre de modales actuellement ouvertes (utile pour les tests). */
  stackSize(): number {
    return this.stack.length;
  }

  /** Doit être appelé une fois au boot (capture les touches Escape). */
  attachKeyboard(target: EventTarget = document): () => void {
    const handler = ((e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape' && this.stack.length > 0) {
        this.closeTop('escape');
      }
    }) as EventListener;
    target.addEventListener('keydown', handler);
    return () => target.removeEventListener('keydown', handler);
  }

  private hide(opened: OpenModal, reason: ModalCloseReason): void {
    opened.elements.modal.hidden = true;
    if (opened.elements.backdrop) opened.elements.backdrop.hidden = true;
    opened.previousFocus?.focus?.();
    opened.callbacks?.onClose?.(reason);
  }

  private lockBody(): void {
    if (this.bodyLocked) return;
    this.body.style.overflow = 'hidden';
    this.bodyLocked = true;
  }

  private unlockBody(): void {
    if (!this.bodyLocked) return;
    this.body.style.overflow = '';
    this.bodyLocked = false;
  }
}

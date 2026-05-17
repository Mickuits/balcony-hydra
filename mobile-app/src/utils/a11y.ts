/**
 * a11y — utilitaires accessibilité.
 *
 * Focus trap, live announcer, reduced motion detection. Toutes les fonctions
 * sont DOM-pures (testables en jsdom).
 */

/** Sélecteur des éléments focusables standards (sans détails du shadow DOM). */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Retourne les éléments focusables descendants d'un container.
 *
 * Filtrage : exclut `inert` et les éléments avec `display:none` ou
 * `visibility:hidden` (vérification offsetParent ne fonctionne pas en jsdom).
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute('inert')) return false;
    if (el.hidden) return false;
    // En jsdom offsetParent est souvent null même pour des éléments visibles
    // → on se limite aux check explicites.
    const style = el.getAttribute('style') ?? '';
    if (/display:\s*none/i.test(style) || /visibility:\s*hidden/i.test(style)) return false;
    return true;
  });
}

/**
 * Active un focus trap dans `container` : Tab / Shift+Tab cyclent dans les
 * éléments focusables. Retourne une fonction de détachement.
 *
 * Usage typique dans une modale :
 *   const release = trapFocus(modalEl);
 *   // ... on close:
 *   release();
 */
export function trapFocus(container: HTMLElement): () => void {
  const handler = (e: Event): void => {
    const ev = e as KeyboardEvent;
    if (ev.key !== 'Tab') return;
    const focusables = getFocusableElements(container);
    if (focusables.length === 0) {
      ev.preventDefault();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (ev.shiftKey) {
      if (active === first || !container.contains(active)) {
        ev.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !container.contains(active)) {
        ev.preventDefault();
        first.focus();
      }
    }
  };
  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}

/**
 * Crée (si nécessaire) un live region polite + assertive, et expose un
 * `announce()` global pour les messages d'état.
 *
 * Pattern : le live region est inséré une seule fois dans <body>, partagé
 * par toute l'app. Les messages sont écrits via textContent (pas innerHTML).
 */
export interface A11yAnnouncer {
  /** Annonce polie (lecteur d'écran attend une pause). */
  polite(message: string): void;
  /** Annonce assertive (interruption immédiate). */
  assertive(message: string): void;
  destroy(): void;
}

export function createAnnouncer(parent: HTMLElement = document.body): A11yAnnouncer {
  const politeEl = document.createElement('div');
  politeEl.setAttribute('role', 'status');
  politeEl.setAttribute('aria-live', 'polite');
  politeEl.setAttribute('aria-atomic', 'true');
  politeEl.className = 'sr-only';
  politeEl.id = 'a11y-polite';

  const assertiveEl = document.createElement('div');
  assertiveEl.setAttribute('role', 'alert');
  assertiveEl.setAttribute('aria-live', 'assertive');
  assertiveEl.setAttribute('aria-atomic', 'true');
  assertiveEl.className = 'sr-only';
  assertiveEl.id = 'a11y-assertive';

  parent.appendChild(politeEl);
  parent.appendChild(assertiveEl);

  return {
    polite(message: string): void {
      // Le clear + reset force la re-annonce même si le texte est identique
      politeEl.textContent = '';
      setTimeout(() => {
        politeEl.textContent = message;
      }, 50);
    },
    assertive(message: string): void {
      assertiveEl.textContent = '';
      setTimeout(() => {
        assertiveEl.textContent = message;
      }, 50);
    },
    destroy(): void {
      politeEl.remove();
      assertiveEl.remove();
    },
  };
}

/**
 * Renvoie `true` si l'utilisateur a activé `prefers-reduced-motion`.
 * Utile pour désactiver les animations dans les screens.
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Renvoie `true` si l'utilisateur a activé `prefers-color-scheme: dark`.
 */
export function prefersDarkColorScheme(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/**
 * Helpers DOM — typed, fail-fast en mode dev.
 */

/**
 * Sélectionne un élément par ID et lève une erreur si introuvable.
 * Pour les éléments du shell qu'on sait présents (#app, #dashboard, etc.).
 */
export function $id<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`[dom] Element #${id} not found`);
  }
  return el as T;
}

/**
 * Sélectionne un élément par ID, retourne null si absent.
 */
export function $idOptional<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/**
 * Sélecteur typé pour `querySelector`.
 */
export function $<T extends HTMLElement = HTMLElement>(
  selector: string,
  scope: ParentNode = document
): T | null {
  return scope.querySelector<T>(selector);
}

/**
 * Sélecteur typé pour `querySelectorAll` — retourne un array.
 */
export function $$<T extends HTMLElement = HTMLElement>(
  selector: string,
  scope: ParentNode = document
): T[] {
  return Array.from(scope.querySelectorAll<T>(selector));
}

/**
 * Set textContent uniquement si la valeur a changé (perf, evite reflow).
 */
export function setText(el: HTMLElement | null, value: string): void {
  if (el && el.textContent !== value) el.textContent = value;
}

/**
 * Set inline style uniquement si différent.
 */
export function setStyle(el: HTMLElement | null, prop: string, value: string): void {
  if (el && el.style.getPropertyValue(prop) !== value) {
    el.style.setProperty(prop, value);
  }
}

/**
 * Toggle classe selon condition.
 */
export function toggleClass(el: HTMLElement | null, className: string, on: boolean): void {
  if (el) el.classList.toggle(className, on);
}

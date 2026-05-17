/**
 * Barrel export — router (Screen, BaseScreen, Router, registry).
 */
export type { Screen, ScreenProps } from './screen';
export { BaseScreen } from './screen';
export { Router } from './router';
export type { ContainerResolver, RouterDeps } from './router';
export { NAV_OF_SCREEN, ALL_SCREEN_IDS, buildScreenRegistry } from './screen-registry';

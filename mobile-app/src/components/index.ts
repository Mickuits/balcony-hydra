/**
 * Barrel export — composants UI réutilisables (DOM-bound).
 */
export { BindingEngine } from './binding-engine/binding-engine';
export type { Binding, BindingProducer, BindingTarget } from './binding-engine/binding-engine';

export { ModalManager } from './modal-manager/modal-manager';
export type {
  ModalElements,
  ModalCallbacks,
  ModalCloseReason,
} from './modal-manager/modal-manager';

export { BottomNav } from './bottom-nav/bottom-nav';
export type { BottomNavDeps } from './bottom-nav/bottom-nav';

export { MqttBanner } from './mqtt-banner/mqtt-banner';
export type { MqttBannerDeps } from './mqtt-banner/mqtt-banner';

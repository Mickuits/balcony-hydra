/**
 * Balcony Hydra v4 — Mobile control app entry point.
 *
 * Boot sequence (single entry, fixes double-boot bug from legacy proto) :
 *   1. Load CSS modules in order (variables → reset → ... → animations)
 *   2. Construit les stores (singletons exportés depuis `stores/`)
 *   3. Init services (storage, rest-client, mqtt-bridge, mock-service)
 *   4. Construit BindingEngine + ModalManager + screens (16 portés)
 *   5. Build router + wire BottomNav + MqttBanner
 *   6. Navigate vers le dashboard
 *   7. Start mock service (auto-suspend quand MQTT LIVE)
 *   8. Register SW (en mode http/https, jamais file://)
 */

// CSS imports — ordre strict (animations TOUJOURS en dernier)
import './styles/variables.css';
import './styles/reset.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/nav.css';
import './styles/a11y.css';
import './styles/animations.css';

import { hardwareStore, configStore, uiStore, statsStore, liveLogStore } from './stores';
import {
  StorageService,
  RestClient,
  MqttBridge,
  MockService,
  ConfigBackupService,
  ErrorTracking,
} from './services';
import { BindingEngine, ModalManager, BottomNav, MqttBanner } from './components';
import { Router, buildScreenRegistry } from './router';
import { buildScreenFactories } from './screens';
import { INITIAL_PROFILES, INITIAL_WEATHER } from './data';
import { createAnnouncer } from './utils/a11y';
import type { NavId, ScreenId, MqttBridgeState } from './types';

const BUILD_ID = '__BUILD__';

const NAV_TO_SCREEN: Record<NavId, ScreenId> = {
  dashboard: 'dashboard',
  pots: 'pots',
  tanks: 'tanks',
  stats: 'stats',
  system: 'system',
};

function main(): void {
  const app = document.getElementById('app');
  if (!app) throw new Error('[boot] #app container manquant');
  console.warn(`[boot] Balcony Hydra v4 · build ${BUILD_ID}`);

  // ─── Services ────────────────────────────────────────────
  const storage = new StorageService();
  // ErrorTracking installé en premier pour capturer les erreurs du boot lui-même.
  const errorTracking = new ErrorTracking({ storage, buildId: BUILD_ID });
  errorTracking.install();

  const rest = new RestClient(storage);
  rest.init();

  const bridge = new MqttBridge({ hardware: hardwareStore, liveLog: liveLogStore, storage });
  bridge.init();

  const mockService = new MockService({
    hardware: hardwareStore,
    liveLog: liveLogStore,
    mqttBridge: bridge,
    profiles: INITIAL_PROFILES,
  });

  const backup = new ConfigBackupService({ storage, buildId: BUILD_ID });

  // ─── UI core ─────────────────────────────────────────────
  const bindings = new BindingEngine();
  const modalMgr = new ModalManager();
  modalMgr.attachKeyboard();
  const announcer = createAnnouncer(document.body);

  // Annonce les changements de connexion MQTT (a11y)
  bridge.addEventListener('statechange', (e) => {
    const state = (e as CustomEvent<MqttBridgeState>).detail;
    if (state === 'connected') announcer.polite('Connexion MQTT établie');
    else if (state === 'error') announcer.assertive('Connexion MQTT perdue');
  });

  // Annonce les erreurs capturées
  errorTracking.addEventListener('capture', (e) => {
    const entry = (e as CustomEvent<{ severity: string; message: string }>).detail;
    if (entry.severity === 'error') announcer.assertive(`Erreur : ${entry.message}`);
  });

  // ─── Screens + router ────────────────────────────────────
  // Forward-decl pour pouvoir référencer router dans les callbacks
  // eslint-disable-next-line prefer-const
  let router: Router;
  const factories = buildScreenFactories({
    hardware: hardwareStore,
    config: configStore,
    ui: uiStore,
    stats: statsStore,
    bindings,
    storage,
    backup,
    profiles: INITIAL_PROFILES,
    forecast: INITIAL_WEATHER,
    callbacks: {
      onDashboard: (a) => {
        if (a === 'waterAll') void rest.pumpStart();
        else if (a === 'openVacation') router.navigate('vacation');
      },
      onPots: (a) => {
        if (a.type === 'openDetail') router.navigate('detail', { selectedId: a.potId });
        else if (a.type === 'addPot') router.navigate('addPot');
      },
      onTanks: (a) => {
        if (a.type === 'openDetail') router.navigate('tankDetail', { selectedId: a.tankId });
        else if (a.type === 'addTank') router.navigate('addTank');
      },
      onSystem: (a) => {
        if (a.type === 'reboot') void rest.reboot();
        else if (a.type === 'factoryReset') void rest.factoryReset();
        else if (a.type === 'safetyUnlock') void rest.safetyUnlock();
        else if (a.type === 'pairSlave') router.navigate('addPairing');
        else if (a.type === 'openConfigurator') router.navigate('configurator');
      },
      onDetail: (a) => {
        if (a.type === 'back') router.navigate('pots');
        else if (a.type === 'waterPot') void rest.pumpStart();
        else if (a.type === 'editPot') router.navigate('editPot', { selectedId: a.potId });
        else if (a.type === 'togglePot') void rest.updateConfig({});
      },
      onTankDetail: (a) => {
        if (a.type === 'back') router.navigate('tanks');
        else if (a.type === 'editTank') router.navigate('tankEdit', { selectedId: a.tankId });
        else if (a.type === 'configTank') router.navigate('tankConfig', { selectedId: a.tankId });
        else if (a.type === 'markFilled') void rest.updateConfig({});
      },
      onTankConfig: (a) => {
        if (a.type === 'back') router.navigate('tankDetail');
        else if (a.type === 'save') void rest.updateConfig({});
      },
      onTankEdit: (a) => {
        if (a.type === 'back') router.navigate('tankDetail');
        else if (a.type === 'save') void rest.updateConfig({});
      },
      onEditPot: (a) => {
        if (a.type === 'back') router.navigate('detail');
        else if (a.type === 'save') void rest.updateConfig({});
        else if (a.type === 'delete') void rest.updateConfig({});
      },
      onConfigurator: (a) => {
        if (a.type === 'back') router.navigate('system');
        else if (a.type === 'save') {
          rest.setConfig(a.payload.rest);
          bridge.setConfig(a.payload.mqtt);
          configStore.setWateringMode(a.payload.mode);
          router.navigate('system');
        } else if (a.type === 'configImported') {
          // Réinitialise les services avec la config importée
          rest.init();
          bridge.init();
        }
      },
      onAddPotComplete: () => router.navigate('pots'),
      onAddPotCancel: () => router.navigate('pots'),
      onAddPairingComplete: () => router.navigate('system'),
      onAddPairingCancel: () => router.navigate('system'),
      onAddTankComplete: () => router.navigate('tanks'),
      onAddTankCancel: () => router.navigate('tanks'),
    },
  });
  const screens = buildScreenRegistry(factories);
  router = new Router({
    screens,
    resolveContainer: (id) => document.getElementById(id),
    uiStore,
    onError: (err, context) => {
      errorTracking.captureException(err, `router:${context}`);
      console.error(`[router] ${context}`, err);
    },
  });

  // ─── Bottom nav ──────────────────────────────────────────
  const navRoot = app.querySelector<HTMLElement>('nav.nav');
  if (navRoot) {
    const bottomNav = new BottomNav({
      root: navRoot,
      uiStore,
      onNavigate: (navId) => router.navigate(NAV_TO_SCREEN[navId]),
    });
    bottomNav.mount();
  }

  // ─── MQTT banner ─────────────────────────────────────────
  const bannerRoot = document.getElementById('mqttBanner');
  if (bannerRoot) {
    const banner = new MqttBanner({
      root: bannerRoot,
      bridge,
      onAction: () => bridge.forceReconnect(),
    });
    banner.mount();
  }

  // ─── Premier render ──────────────────────────────────────
  router.navigate('dashboard');

  // ─── Mock service ────────────────────────────────────────
  mockService.start();

  // ─── Service Worker (PWA) ────────────────────────────────
  registerServiceWorker();

  // Expose pour debug en dev (jamais en prod)
  if (import.meta.env?.DEV) {
    (globalThis as Record<string, unknown>)['__hydra'] = {
      stores: { hardwareStore, configStore, uiStore, statsStore, liveLogStore },
      services: { rest, bridge, mockService, storage, backup, errorTracking },
      router,
      modalMgr,
    };
  }
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .catch((err) => console.warn('[sw] register failed', err));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}

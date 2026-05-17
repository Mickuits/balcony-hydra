/**
 * Balcony Hydra v4 — Mobile control app entry point.
 *
 * Boot sequence (single entry, fixes double-boot bug from legacy proto) :
 *   1. Load CSS modules in order (variables → reset → ... → animations)
 *   2. Construit les stores (singletons exportés depuis `stores/`)
 *   3. Init services (storage, rest-client, mqtt-bridge, mock-service)
 *   4. Construit BindingEngine + ModalManager + screens
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
import './styles/animations.css';

import { hardwareStore, configStore, uiStore, statsStore, liveLogStore } from './stores';
import { StorageService, RestClient, MqttBridge, MockService } from './services';
import { BindingEngine, ModalManager, BottomNav, MqttBanner } from './components';
import { Router, buildScreenRegistry } from './router';
import { buildScreenFactories } from './screens';
import { INITIAL_PROFILES } from './data';
import type { NavId, ScreenId } from './types';

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

  // ─── UI core ─────────────────────────────────────────────
  const bindings = new BindingEngine();
  const modalMgr = new ModalManager();
  modalMgr.attachKeyboard();

  // ─── Router + screens ────────────────────────────────────
  const factories = buildScreenFactories({
    dashboard: {
      hardware: hardwareStore,
      bindings,
      onAction: (action) => {
        if (action === 'waterAll') {
          void rest.pumpStart();
        }
        if (action === 'openVacation') {
          router.navigate('vacation');
        }
      },
    },
  });
  const screens = buildScreenRegistry(factories);
  const router = new Router({
    screens,
    resolveContainer: (id) => document.getElementById(id),
    uiStore,
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
      services: { rest, bridge, mockService, storage },
      router,
    };
  }
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  // vite-plugin-pwa génère /sw.js
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .catch((err) => console.warn('[sw] register failed', err));
}

// Single entry point (no double-boot)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}

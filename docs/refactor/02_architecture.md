# Architecture cible — refactor mobile production

> Output VAGUE 1.B du refactor — produit par agent code-architect 2026-05-18
> Stack : Vite + TypeScript strict + vanilla TS + Vitest + Playwright + vite-plugin-pwa

---

## 1. Arborescence cible `mobile-app/`

```
mobile-app/
├── public/
│   ├── icons/
│   │   ├── icon.svg
│   │   └── icon-maskable.svg
│   └── manifest.webmanifest
│
├── src/
│   ├── index.html                 # shell minimal (containers + nav vide)
│   ├── main.ts                    # entry point unique
│   │
│   ├── types/                     # types globaux
│   │   ├── hardware.ts            # MasterState, SlaveState, SafetyState, PairingState, Pot, Tank, etc.
│   │   ├── config.ts              # SystemConfig, MoistureConfig, etc.
│   │   ├── api.ts                 # REST API contracts (response shapes)
│   │   ├── mqtt.ts                # Payloads MQTT (mirror docs/mobile_api_contract.md)
│   │   ├── profiles.ts            # PlantProfile, ProfileId
│   │   └── ui.ts                  # WateringMode, FilterType, ScreenId, etc.
│   │
│   ├── data/                      # données mock (seed initial)
│   │   ├── mock-hardware.ts       # INITIAL_HARDWARE
│   │   ├── mock-config.ts         # INITIAL_CONFIG
│   │   ├── mock-profiles.ts       # INITIAL_PROFILES
│   │   ├── mock-stats.ts          # INITIAL_STATS, STATS_PERIOD_CONFIG
│   │   ├── mock-weather.ts        # INITIAL_WEATHER
│   │   ├── mock-live-log.ts       # SEED_LOG
│   │   └── safety-presets.ts      # SAFETY_PRESETS (constant)
│   │
│   ├── stores/                    # state management (Observable pattern)
│   │   ├── store.ts               # Class Store<T> de base (subscribe/emit)
│   │   ├── hardware.store.ts      # HardwareStore (master, slaves, safety, pairing, pots, tanks)
│   │   ├── config.store.ts        # ConfigStore
│   │   ├── stats.store.ts         # StatsStore
│   │   ├── ui.store.ts            # UiStore (currentPotFilter, currentStatsPeriod, selectedPot, etc.)
│   │   └── live-log.store.ts      # LiveLogStore (max 12 entries)
│   │
│   ├── services/                  # logique métier + I/O
│   │   ├── storage.ts             # StorageService (localStorage wrapper, JSON safe)
│   │   ├── mqtt-bridge.ts         # MqttBridge class avec FSM
│   │   ├── rest-client.ts         # RestClient class avec auth header + retry
│   │   ├── mock-service.ts        # MockService (remplace startLiveUpdates)
│   │   ├── error-tracking.ts     # ErrorTrackingService (Vague 4.C)
│   │   ├── sw-controller.ts       # registerSW, update prompt
│   │   └── weather.ts             # computeWeatherCoefficient (FAO Penman-Monteith)
│   │
│   ├── router/
│   │   ├── router.ts              # Router class (switchScreen, hash navigation)
│   │   └── screen-registry.ts     # Map<ScreenId, Screen>, navMapping
│   │
│   ├── screens/                   # 1 dossier par screen, .ts + .css + tests
│   │   ├── dashboard/
│   │   │   ├── dashboard.screen.ts
│   │   │   ├── dashboard.template.ts   # tagged template literal HTML
│   │   │   └── dashboard.screen.test.ts
│   │   ├── pots/
│   │   ├── detail/
│   │   ├── stats/
│   │   ├── profiles/
│   │   ├── system/
│   │   ├── tanks/
│   │   ├── tank-detail/
│   │   ├── tank-config/
│   │   ├── add-tank/
│   │   ├── tank-edit/
│   │   ├── vacation/
│   │   ├── configurator/
│   │   ├── add-pot/
│   │   ├── edit-pot/
│   │   └── add-pairing/
│   │
│   ├── components/                # composants réutilisables
│   │   ├── binding-engine/        # remplace BINDINGS strings par typed map
│   │   ├── bottom-nav/
│   │   ├── modal-manager/         # openModal / closeModal centralisés
│   │   ├── kpi-card/
│   │   ├── gauge/
│   │   ├── mqtt-banner/
│   │   ├── safety-card/
│   │   ├── pairing-card/
│   │   ├── pot-tile/
│   │   ├── tank-card/
│   │   ├── wizard-stepper/
│   │   ├── chip/
│   │   └── live-log/
│   │
│   ├── utils/
│   │   ├── format.ts              # fmtDurationHuman, fmtDurationShort, fmtUptime, fmtMacShort
│   │   ├── validators.ts          # validateMacAddress, validateUrl, validateToken, etc.
│   │   ├── dom.ts                 # safe innerHTML, escape HTML, focus trap
│   │   ├── sanitize.ts            # escapeHtml, sanitizeMqttPayload (Vague 4)
│   │   └── pots.ts                # getPotsByZone, getAlertPots, avgHumidity
│   │
│   ├── styles/                    # CSS modulaire (1 fichier par section)
│   │   ├── variables.css          # :root variables (couleurs, fonts)
│   │   ├── reset.css              # *{box-sizing}, body
│   │   ├── typography.css         # h1, mono, etc.
│   │   ├── layout.css             # .app, .header, .screen-wrap
│   │   ├── nav.css                # .nav, .nav-item
│   │   ├── components.css         # .btn, .kpi, .chip, .profile-card
│   │   ├── modals.css             # .modal-bg, .modal, .modal-handle
│   │   ├── pots.css               # .pots, .pot, .pot.*
│   │   ├── tanks.css              # .tank-card, .tank-viz
│   │   ├── charts.css             # SVG charts
│   │   ├── forms.css              # .field, .field-input, .pin-grid
│   │   ├── system.css             # .topology, .sys-status, .remote-action
│   │   ├── mqtt-banner.css
│   │   └── animations.css         # 9 @keyframes (TOUJOURS chargé en DERNIER)
│   │
│   └── sw.ts                      # Service Worker source (généré par vite-plugin-pwa)
│
├── tests/
│   ├── unit/                      # mirroir de src/ pour les tests unitaires
│   │   ├── services/
│   │   ├── stores/
│   │   ├── utils/
│   │   └── components/
│   ├── e2e/                       # Playwright
│   │   ├── flows/
│   │   │   ├── safety.spec.ts
│   │   │   ├── pairing.spec.ts
│   │   │   ├── waterAll.spec.ts
│   │   │   └── ...
│   │   ├── screens/               # 1 spec par screen
│   │   └── fixtures.ts            # mock master HTTP server
│   ├── helpers/
│   │   ├── mock-master.ts         # fake REST + MQTT server
│   │   └── playwright-helpers.ts
│   └── tsconfig.test.json
│
├── package.json
├── tsconfig.json
├── vite.config.ts                 # PWA mode (déployable sur serveur)
├── vite.standalone.config.ts      # mode single-file (file:// compatible)
├── vitest.config.ts
├── playwright.config.ts
├── .eslintrc.cjs
└── .prettierrc.json
```

---

## 2. Choix techniques justifiés

### 2.1 TypeScript strict (sans framework)

- `strict: true` dans tsconfig.json (cohérent avec CLAUDE.md user)
- Pas de React/Vue : vanilla TS + tagged template literals pour les vues
- Web Components ? Non — overhead lifecycle pas nécessaire pour 16 screens stateless. Composants = fonctions `mount(rootEl, props) → unmount()`.

### 2.2 State management : Observable Store pattern custom

```typescript
class Store<T> {
  private listeners = new Set<(state: T) => void>();
  constructor(private state: T) {}

  get(): T { return this.state; }
  set(partial: Partial<T>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(fn => fn(this.state));
  }
  subscribe(fn: (state: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
```

Stores = singletons exportés. Pattern : `screen.mount()` souscrit, retourne `unmount()` qui désinscrit.

### 2.3 Routing : custom switchScreen + hash optionnel

`Router` singleton. `init()` lit `location.hash`, navigate vers screen. `navigate(id)` met `display:block` sur l'écran cible, `display:none` sur les autres. Conserve `screen.activate(props)` / `screen.deactivate()` pour cleanup intervals.

### 2.4 CSS : 1 fichier par section, importé par main.ts

Ordre de chargement explicite dans main.ts (variables → reset → layout → components → screens → animations). `animations.css` TOUJOURS en dernier pour ne pas être overridé.

### 2.5 Bundling : Vite ESM, 2 modes

- **PWA mode** (`vite.config.ts`) : code-split par screen, SW généré par vite-plugin-pwa, déployable sur serveur.
- **Standalone mode** (`vite.standalone.config.ts`) : single-file inline (CSS + JS dans HTML) via vite-plugin-singlefile. Pour serveur depuis firmware PROGMEM ou usage file:// local.

### 2.6 Tests : Vitest unit + Playwright E2E

- Vitest + jsdom pour unit (stores, services, utils, components rendering)
- Playwright pour E2E (flows complets, multi-browser)
- Couverture cible : 80% global, 60% screens

### 2.7 Linting : ESLint + Prettier

- ESLint avec règles strictes (no-any, no-magic-numbers, no-console sauf catch)
- Prettier (config figée dans `mobile-app/.prettierrc.json`) : 2 spaces, single quotes, **semi: true**, trailingComma es5, printWidth 100

### 2.8 mqtt.js bundlé via npm

Plus de CDN unpkg. `npm install mqtt@^5.10.4`. Bundle gère le tree-shaking.

---

## 3. Patterns recommandés

### 3.1 Typage du state global

```typescript
// src/types/hardware.ts
export type SafetyState = 'NORMAL' | 'THERMAL_LOCKOUT' | 'HARD_LOCKOUT' | 'SAFE_MODE';
export type PairingStatus = 'PAIRED' | 'UNPAIRED' | 'PAIRING';
export type PotState = 'crit' | 'dry' | 'ok' | 'high' | 'watering' | 'off';
export type ControllerId = 'MASTER' | 'SLAVE';

export interface MasterState {
  online: boolean;
  uptime: number;
  // ...
}

export interface HardwareState {
  master: MasterState;
  slaves: Record<string, SlaveState>;
  ups: UpsState;
  pairing: PairingState;
  safety: SafetyManagerState;
  pots: Record<string, Pot>;
  tanks: Record<string, Tank>;
}
```

### 3.2 Remplacement des `data-bind` strings

Option A retenue : **tagged template literals + bindings typés**

```typescript
// src/components/binding-engine/binding-engine.ts
type BindingKey =
  | 'sys.uptime' | 'sys.ramUsed' | 'sys.lastSync'
  | 'pots.online' | 'pots.alertCount'
  | 'safety.state' | 'safety.tempPcb'
  // ...
  ;

const BINDINGS: Record<BindingKey, () => string> = {
  'sys.uptime': () => fmtUptime(hardwareStore.get().master.uptime),
  // ...
};

export function applyBindings(scope: HTMLElement = document.body): void {
  scope.querySelectorAll<HTMLElement>('[data-bind]').forEach(el => {
    const key = el.dataset.bind as BindingKey;
    const fn = BINDINGS[key];
    if (!fn) {
      console.warn('[binding] unknown key', key);
      return;
    }
    el.textContent = fn();
  });
}
```

Le typage `BindingKey` litéral union force le compilateur à signaler toute clé inexistante (mais ne vérifie pas le contenu HTML — il faut une validation au boot dev).

### 3.3 Composants stateful sans framework

```typescript
// src/components/safety-card/safety-card.ts
export class SafetyCard {
  private unsubscribe?: () => void;

  constructor(private root: HTMLElement, private store: typeof hardwareStore) {}

  mount(): void {
    this.render(this.store.get());
    this.unsubscribe = this.store.subscribe(state => this.render(state));
  }

  unmount(): void {
    this.unsubscribe?.();
  }

  private render(state: HardwareState): void {
    const preset = SAFETY_PRESETS[state.safety.state];
    this.root.querySelector('#safetyStateLabel')!.textContent = preset.label;
    // ...
  }
}
```

### 3.4 Écrire un screen testable

Séparer le rendering pur (fonction qui prend state → HTML string) du wiring (event listeners). Le rendering est testable unitairement avec un état figé.

```typescript
// src/screens/safety/safety.template.ts
export function renderSafetyTemplate(state: SafetyManagerState): string {
  const preset = SAFETY_PRESETS[state.state];
  return `
    <div class="safety-card ${preset.color}">
      <div data-test="state-label">${preset.label}</div>
      <div data-test="reason">${escapeHtml(state.reason ?? preset.reason)}</div>
    </div>
  `;
}

// test
import { renderSafetyTemplate } from './safety.template';
test('renders THERMAL_LOCKOUT correctly', () => {
  const html = renderSafetyTemplate({ state: 'THERMAL_LOCKOUT', reason: 'T° > 58°C', /* ... */ });
  expect(html).toContain('THERMAL LOCKOUT');
  expect(html).toContain('T° > 58°C');
});
```

### 3.5 Mocking services dans les tests

Tous les services exposent des classes injectées via constructeur. En tests :

```typescript
import { vi } from 'vitest';
import { RestClient } from '@/services/rest-client';

test('confirmSafetyUnlock calls REST when live', async () => {
  const restClient = new RestClient(new StorageService());
  vi.spyOn(restClient, 'safetyUnlock').mockResolvedValue({ ok: true, status: 200 });
  vi.spyOn(restClient, 'isLive').mockReturnValue(true);

  await confirmSafetyUnlock({ restClient, hardwareStore });

  expect(restClient.safetyUnlock).toHaveBeenCalled();
  expect(hardwareStore.get().safety.state).toBe('NORMAL');
});
```

---

## 4. Plan de migration incrémental (7 étapes)

### Étape 1 — Setup tooling (zéro touche au code legacy)
- Créer `mobile-app/` à côté de `mobile/`
- package.json + Vite + TypeScript + Vitest + Playwright
- vite.config.ts (PWA) + vite.standalone.config.ts (single-file)
- CI workflow : ajouter `build:pwa`, `test`, `test:e2e` pour mobile-app
- Critère de validation : `npm run build:pwa` produit un bundle vide qui sert un index.html avec "Hello world" + 1 test Vitest pass

### Étape 2 — Types + data layer
- `src/types/*.ts` : interfaces TS pour HardwareState, ConfigState, etc.
- `src/data/mock-*.ts` : extraire les const HARDWARE, CONFIG, etc. en typé
- `src/data/safety-presets.ts` : SAFETY_PRESETS
- Tests : type-check pass (`tsc --noEmit`), pas de tests unit ici

### Étape 3 — Stores
- `src/stores/store.ts` : Class Store<T> base
- `src/stores/{hardware,config,stats,ui,live-log}.store.ts`
- Tests unitaires : subscribe/emit/set/get
- Critère : `vitest run src/stores` 100% pass

### Étape 4 — Services
- `src/services/storage.ts` : wrapper localStorage avec types
- `src/services/mqtt-bridge.ts` : port de mqttBridge en class TS
- `src/services/rest-client.ts` : port de restClient en class TS
- `src/services/mock-service.ts` : extraction de startLiveUpdates
- Tests unitaires : FSM transitions, retry backoff, dispatch payload
- Critère : `vitest run src/services` 100% pass, coverage > 85%

### Étape 5 — Utils + components génériques
- `src/utils/format.ts` : **fmtDurationHuman + fmtDurationShort** (résout bug #1)
- `src/utils/sanitize.ts` : escapeHtml, sanitize MQTT payload
- `src/components/binding-engine/` : applyBindings typé
- `src/components/modal-manager/` : openModal/closeModal centralisé
- `src/components/wizard-stepper/` : composant générique pour les 4 wizards
- Tests unitaires : tous les utils + binding-engine
- Critère : coverage utils > 95%

### Étape 6 — Screen par screen (16 screens)
Ordre suggéré (dépendances minimales d'abord) :
1. `dashboard` (simple, lit stores)
2. `pots` + `detail` + `configurator`
3. `tanks` + `tankDetail` + `tankConfig`
4. `stats` + `vacation`
5. `system` (MQTT card + REST card + topology)
6. `safety` + `pairing`
7. Wizards : `addPot`, `addPairing` (les 2 fonctionnels)
8. Stubs : `editPot`, `addTank`, `tankEdit`, `profiles` (laisser stubs explicites)

Pour chaque screen :
- `screen.ts` (class + mount/unmount)
- `template.ts` (fonction pure state → HTML)
- `screen.test.ts` (unit test du template)
- Update `screen-registry.ts`
- E2E test : `tests/e2e/screens/<id>.spec.ts` (smoke test : screen monte, render initial)

Critère : tous les screens montent + démontent sans erreur console + tests E2E smoke pass.

### Étape 7 — Migration UX + cleanup
- Valider visuel pixel-perfect avec ancien proto (screenshots comparison Playwright)
- Migrer les modaux (14 modaux statiques HTML)
- Cleanup `mobile/balcony-hydra-mobile.html` → archive `docs/refactor/legacy/`
- Update `mobile/README.md` pour pointer vers `mobile-app/`
- Update `mobile/manifest.webmanifest` start_url
- Update CLAUDE.md projet

---

## 5. Coverage tests cible

| Module | Cible | Type test | Justification |
|---|---|---|---|
| `src/stores/` | 95% | unit | Logique pure, observable pattern, no DOM |
| `src/services/` | 90% | unit | FSM testable, mocks fetch + WebSocket |
| `src/utils/` | 95% | unit | Fonctions pures (format, validators, sanitize) |
| `src/components/` (template fns) | 85% | unit | Fonctions pures state → HTML |
| `src/components/` (class wiring) | 70% | unit + e2e | DOM heavy → e2e couvre |
| `src/screens/` (template) | 80% | unit | Fonctions pures |
| `src/screens/` (mount/unmount) | 60% | unit | Smoke test : monte sans crash |
| Flows utilisateur | 100% | e2e Playwright | 14 modales + 4 wizards + nav |
| Cross-browser | n/a | Playwright matrix | Chromium + Firefox + WebKit |

**Non testable unitairement** (DOM heavy, animations CSS, intervalle timers) : à couvrir par E2E.

---

## 6. package.json détaillé

```json
{
  "name": "balcony-hydra-mobile",
  "version": "4.2.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build:pwa": "vite build",
    "build:standalone": "vite build --config vite.standalone.config.ts",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "typecheck": "tsc --noEmit",
    "validate": "npm run typecheck && npm run lint && npm run test"
  },
  "dependencies": {
    "mqtt": "^5.10.4"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "jsdom": "^24.0.0",
    "@playwright/test": "^1.46.0",
    "vite-plugin-singlefile": "^2.0.0",
    "vite-plugin-pwa": "^0.20.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "prettier": "^3.3.0"
  }
}
```

---

## 7. Configs détaillées

### vite.config.ts (PWA mode)

```typescript
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    cssCodeSplit: false,
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'hydra-fonts', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } }
          },
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'hydra-runtime', networkTimeoutSeconds: 4 }
          }
        ]
      }
    })
  ]
});
```

### vite.standalone.config.ts (single-file mode)

```typescript
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist-standalone',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 1_000_000,
  },
  plugins: [viteSingleFile()],
});
```

### tsconfig.json (strict mode)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "useDefineForClassFields": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "types": ["vite/client", "vitest/globals"],
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/data/**', 'src/types/**', 'src/sw.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75 }
    }
  }
});
```

### playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    { name: 'firefox',  use: { ...devices['iPhone 13'] } }, // viewport mobile
    { name: 'webkit',   use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Règles ESLint critiques

```json
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "prefer-const": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "no-magic-numbers": ["error", { "ignore": [0, 1, -1, 2, 100, 1000], "ignoreArrayIndexes": true }]
  }
}
```

---

## 8. Risques + stratégies de mitigation

| Risque | Mitigation |
|---|---|
| localStorage 5MB limit | StorageService check size, fallback IndexedDB pour gros logs |
| SW cache invalidation | Vite-plugin-pwa avec `registerType: 'prompt'` (user confirme update) |
| Animations CSS perdues | Migrer animations.css en dernier, screenshot diff Playwright |
| Boot order modules ES | Imports explicites dans main.ts, pas de side-effects au top-level |
| Type literal unions trop verbeux | Helpers comme `keyof typeof BINDINGS` quand possible |
| Modaux innerHTML XSS | escapeHtml utility, CSP strict (Vague 4) |
| MQTT.js bundle size | Tree-shaking + dynamic import si nécessaire (~80 KB minified) |
| Vite-plugin-pwa SW path | Configurer `scope` + `start_url` cohérents avec manifest |
| Single-file mode CSS inline | viteSingleFile inline tout, attention <200 KB total bundle |
| TS strict trop dur dans le legacy | Migrer module par module, garder allowJs:false dès le début |

---

## 9. Critères de "qualité production" atteints

À la fin du refactor (étapes 1-7) :

- ✅ TypeScript strict, zéro `any` non justifié
- ✅ Coverage tests > 80% global, > 60% screens
- ✅ Cross-browser validé Chromium + Firefox + WebKit
- ✅ Lighthouse PWA 100, A11y > 95, Performance > 90
- ✅ Bundle size < 250 KB total (avec mqtt.js)
- ✅ CI : build + test + lint + e2e green gate
- ✅ Single source of truth pour la doc (TODO.md + docs/refactor/)
- ✅ Modularité : 16 screens isolés, services injectables, stores typés
- ✅ Sécurité : CSP, sanitize, auth token, plus de CDN
- ✅ Robustesse : error boundary, fallback offline, retry exponentiel

**Pas atteint à ce stade** (TODO firmware ou hors scope) :
- HTTPS master (cert auto-signé) → TODO firmware
- Rate limiting `/api/*` → TODO firmware
- MFA Telegram pour actions critiques → TODO firmware
- Internationalisation (i18n) → français hardcodé, accepté pour MVP solo

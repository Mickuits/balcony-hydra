# Balcony Hydra Mobile App v4.3

PWA TypeScript stricte pour contrôler le système d'arrosage v4 (master/slave ESP32).

## TL;DR

```bash
cd mobile-app
npm install              # installe les deps
npm run dev              # serveur de dev Vite sur http://localhost:5173
npm run validate         # typecheck + lint + format:check + tests
npm run build            # bundle PWA dans ../dist/ + version.json
npm run build:standalone # single-file dans ../dist-standalone/index.html
```

## Architecture

```
mobile-app/src/
├── index.html            # shell HTML + CSP + skip link + 16 screen containers
├── main.ts               # entry point — boot wiring complet
│
├── types/                # 10 fichiers de types stricts (hardware, config, mqtt, …)
├── data/                 # mocks initiaux (INITIAL_HARDWARE, INITIAL_PROFILES, …)
├── utils/                # format, sanitize, dom, pots, a11y
│
├── stores/               # Observable Store<T> + 5 stores singletons
│   ├── store.ts          # generic class Store<T>
│   ├── hardware.store.ts # master + slaves + pots + tanks + safety + pairing
│   ├── config.store.ts   # SystemConfig (mode arrosage, location)
│   ├── ui.store.ts       # state éphémère UI (currentScreen, selectedPot, …)
│   ├── stats.store.ts    # stats + periodConfig
│   └── live-log.store.ts # ring buffer 12 entries
│
├── services/             # logique métier I/O
│   ├── storage.ts         # localStorage wrapper type-safe
│   ├── rest-client.ts     # FSM + X-Hydra-Token + timeout 4s
│   ├── mqtt-bridge.ts     # FSM + backoff exp + payload sanitize + size cap
│   ├── mock-service.ts    # tick 3s, suspendu quand bridge LIVE
│   ├── weather.ts         # computeWeatherCoefficient (Penman-Monteith)
│   ├── config-backup.ts   # export/import config JSON signé SHA-256
│   ├── error-tracking.ts  # capture window.onerror + persistance
│   └── update-checker.ts  # poll /version.json pour détecter updates
│
├── router/               # Router lazy mount + Screen interface + registry
│
├── components/           # UI réutilisables DOM-bound
│   ├── binding-engine/    # remplace data-bind strings legacy
│   ├── modal-manager/     # stack LIFO + focus trap + Escape global
│   ├── bottom-nav/        # highlight via NAV_OF_SCREEN
│   └── mqtt-banner/       # reflète bridge.state
│
├── screens/              # 16 screens portés (1 dossier par screen)
│   ├── dashboard/         # KPIs + actions rapides
│   ├── pots/              # grille 20 pots + filtres
│   ├── detail/            # détail pot + actions water/edit/toggle
│   ├── stats/             # 4 périodes (24h/7d/30d/season) + KPIs
│   ├── profiles/          # cartes profils plantes (read-only)
│   ├── system/            # master/slave/safety/pairing/maintenance
│   ├── tanks/             # 2 cartes tanks + jauges
│   ├── tank-detail/       # detail tank + actions
│   ├── tank-config/       # seuils warn/crit
│   ├── tank-edit/         # nom + capacité
│   ├── add-tank/          # wizard 4 étapes
│   ├── vacation/          # planificateur Penman-Monteith
│   ├── configurator/      # REST + MQTT + mode + backup
│   ├── add-pot/           # wizard 5 étapes
│   ├── edit-pot/          # form édition
│   ├── add-pairing/       # wizard 3 étapes ESP-NOW
│   └── wizard/            # BaseWizard primitive partagée
│
└── styles/               # CSS modulaire — ordre strict imposé par main.ts
    ├── variables.css      # :root design tokens (couleurs, fonts)
    ├── reset.css          # reset CSS minimal
    ├── layout.css         # .app, .screen-wrap
    ├── components.css     # .btn, .kpi, .mqtt-banner, …
    ├── nav.css            # .nav, .nav-item
    ├── a11y.css           # .sr-only, .skip-link, focus-visible
    └── animations.css     # @keyframes — TOUJOURS chargé en dernier
```

## Stack technique

- **Build** : Vite 6 + TypeScript strict + vite-plugin-pwa + vite-plugin-singlefile
- **Tests** : Vitest 2.1 (jsdom) + Playwright 1.49 (E2E cross-browser)
- **Lint** : ESLint 9 flat config + Prettier 3
- **MQTT** : mqtt 5.10 (dynamic import — chunk séparé)
- **PWA** : Service Worker généré (Workbox), manifest, runtime caching API

## Quality gates

CI exécute `npm run validate` à chaque push :

| Gate | Commande | Threshold |
|------|----------|-----------|
| Typecheck | `tsc --noEmit` | 0 erreur |
| Lint | `eslint src tests` | 0 erreur (warnings autorisées) |
| Format | `prettier --check` | 100% |
| Unit tests | `vitest run` | 459/459 ✓ |
| Coverage | `vitest run --coverage` | > 80% sur services/stores/utils |
| Build PWA | `vite build` | bundle < 100kB hors lazy chunks |

## Sécurité

- **CSP strict** dans `index.html` : script-src 'self', object-src 'none',
  frame-ancestors 'none' (voir VAGUE 4 dans DECISIONS.md).
- **MQTT payload hardening** : 1 MB cap, isSafePayload() vs __proto__ pollution,
  type guards stricts, sanitizeMqttString() pour les alertes.
- **REST auth** : X-Hydra-Token automatique sur tous les requests (token persisté
  dans localStorage via StorageService).
- **Export/import config signé SHA-256** pour anti-tampering basique.
- **Error tracking** privé : log local, jamais envoyé sur le réseau.

## Accessibilité (WCAG 2.1 AA)

- Skip link au focus clavier.
- Live regions `polite` + `assertive` via `createAnnouncer()`.
- Focus trap dans les modales (`trapFocus`) + restore focus on close.
- ARIA labels sur toutes les actions (`aria-label`, `aria-current`,
  `aria-modal`, `aria-live`, `role="dialog"`, …).
- Touch targets min 44×44 px (WCAG 2.5.5).
- `prefers-reduced-motion` désactive toutes animations.
- `:focus-visible` outline contrasté.

## Patterns

### Stores

Singleton observables. `subscribe()` retourne un `unsubscribe`. Snapshot des
listeners pour permettre les mutations en cours d'emit. Try/catch autour de
chaque listener (un consumer qui throw ne bloque pas les autres).

```typescript
const unsub = hardwareStore.subscribe((state) => render(state));
hardwareStore.update((s) => ({ ...s, master: { ...s.master, uptime: 0 } }));
unsub();
```

### Screens

Cycle de vie strict : `mount` (1×) → `activate` (chaque navigation) →
`deactivate` (chaque sortie) → `unmount` (rare). `BaseScreen` abstract
gère les flags `isMounted`/`isActive` et expose des hooks `onMount`/
`onActivate`/`onDeactivate`/`onUnmount` aux sous-classes.

### Router

Lazy mount : un screen n'est instancié+mounted qu'à sa première navigation.
Le shell HTML pré-crée les containers. `onError` handler optionnel pour
capturer les exceptions des screens et les router vers `ErrorTracking`.

### Wizards

`BaseWizard<TState>` abstract + array de `WizardStep<TState>` avec
`render`/`collect`/`validate` par étape. Confirmation en step final →
appelle `onComplete(state)`. État résé après unmount.

### Services

EventTarget pour les services réactifs (RestClient, MqttBridge, ErrorTracking,
UpdateChecker). Permet le découplage UI ↔ service via `addEventListener`.
Tous les services exposent un fetchFn / setTimeoutFn / setIntervalFn
injectable pour les tests (pas de vrai I/O en test).

## Conventions de code

- **Langue du code** : anglais (noms de classes, variables, fonctions)
- **Langue des commentaires + UI** : français
- **Strict TS** : `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`
- **Pas de `any`** sans justification + commentaire
- **Magic numbers → constantes nommées**
- **Imports** : alias `@/*` pour `src/*`
- **CSS** : ordre d'import strict dans `main.ts` (animations en dernier)

## Tests

Stratégie : tests par module en isolation (mocks injectables) + tests
d'intégration via `buildScreenFactories` + tests E2E Playwright sur les flows
critiques (waterAll, pairing, safety unlock).

```bash
npm run test                # full suite
npm run test:watch          # watch mode TDD
npm run test:coverage       # avec coverage v8
npm run test:e2e            # Playwright cross-browser
```

Coverage cible :
- `services/` : 100%
- `stores/` : 100%
- `utils/` : 100%
- `components/` : 100%
- `screens/` : 80%+ (focus sur logique métier, pas le rendu pixel)
- `router/` : 100%

## DECISIONS.md

Voir le fichier racine `DECISIONS.md` pour les choix d'architecture
documentés (CSP, sanitization, watermark BUILD_ID, etc).

## Refactor history (VAGUES)

| Vague | Sujet | Commit |
|-------|-------|--------|
| 1.A | Inventaire codebase | `docs/refactor/01_inventaire.md` |
| 1.B | Architecture cible | `docs/refactor/02_architecture.md` |
| 2 | Setup tooling (Vite/TS/Vitest/Playwright/ESLint) | `7827425` |
| 2.B | Types + data + utils + stores + services | `417ff75` |
| 2.C | Router + components + dashboard ref | `56ae6e5` |
| 2.D | 15 screens portés + wizards | `aa03b3f` |
| 4 | CSP + MQTT hardening | `0342a3c` |
| 4.B | Export/import config | `1202671` |
| 4.C | Error boundary + crash log | `9846c40` |
| 5 | A11y pass | `96f1e4b` |
| 5.B | Asset versioning + update checker | `746d348` |

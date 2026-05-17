/**
 * Balcony Hydra v4 — Mobile control app entry point.
 *
 * Boot sequence (single entry, fixes double-boot bug from legacy proto) :
 *   1. Load CSS modules in order (variables → reset → ... → animations)
 *   2. Seed stores with mock data
 *   3. Init services (storage, mqtt-bridge, rest-client, mock)
 *   4. Wire MQTT/REST → stores via event listeners
 *   5. Register screens in router
 *   6. Initial render + router.init() (reads location.hash)
 *   7. Start mock service (auto-suspended when MQTT goes LIVE)
 *   8. Register SW (only over HTTP/HTTPS, not file://)
 */

// CSS imports — strict load order
import './styles/variables.css';
import './styles/reset.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/nav.css';
import './styles/animations.css';

const BUILD_ID = '__BUILD__';

function main(): void {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('[boot] #app container missing');
  }
  console.warn(`[boot] Balcony Hydra v4 · build ${BUILD_ID}`);

  // VAGUE 2 = scaffolding only. Stores, services, screens wired in next waves.
  // Placeholder content to confirm boot works end-to-end.
  const dashboard = document.getElementById('dashboard');
  if (dashboard) {
    dashboard.innerHTML = `
      <div class="header">
        <h1>HYDRA<span>.</span></h1>
        <div class="meta">SCAFFOLDING · BUILD ${BUILD_ID}<br><b>Vague 2 done</b> · prochaine étape : stores</div>
      </div>
      <div class="sys-status">
        <span style="color:var(--accent);">✓</span>
        <span style="color:var(--text-1);">Vite + TypeScript + Vitest + Playwright · prêt à dev</span>
      </div>
    `;
  }
}

// Single entry point (no double-boot)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}

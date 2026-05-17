/**
 * SystemScreen — vue d'ensemble système (master + slave + safety + pairing).
 *
 * Affiche topologie + indicateurs + actions sensibles (reboot, factory-reset,
 * safety unlock). Les actions sont déclenchées via onAction() et le caller
 * (main.ts) confirme + appelle le RestClient.
 */
import { BaseScreen } from '@/router/screen';
import type { ScreenId } from '@/types';
import type { HardwareStore } from '@/stores/hardware.store';
import type { BindingEngine } from '@/components/binding-engine/binding-engine';
import { fmtUptime, fmtDurationHuman, fmtMacShort } from '@/utils/format';

export type SystemAction =
  | { type: 'reboot' }
  | { type: 'factoryReset' }
  | { type: 'safetyUnlock' }
  | { type: 'pairSlave' }
  | { type: 'openConfigurator' };

export interface SystemScreenDeps {
  hardware: HardwareStore;
  bindings: BindingEngine;
  onAction: (action: SystemAction) => void;
}

const BINDING_KEYS = [
  'system.master.uptime',
  'system.master.ram',
  'system.master.mqttRtt',
  'system.slave.online',
  'system.slave.rssi',
  'system.slave.mac',
  'system.safety.state',
  'system.safety.reason',
  'system.safety.cooling',
  'system.pairing.status',
  'system.pairing.since',
] as const;

export class SystemScreen extends BaseScreen {
  readonly id: ScreenId = 'system';
  private readonly deps: SystemScreenDeps;
  private unsub: (() => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: SystemScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    root.innerHTML = `
      <header class="screen-header">
        <h1>Système</h1>
      </header>

      <section class="sys-block" aria-label="Maître">
        <h2>Maître (intérieur, zone B)</h2>
        <dl>
          <dt>Uptime</dt><dd data-bind="system.master.uptime">—</dd>
          <dt>RAM utilisée</dt><dd data-bind="system.master.ram">—</dd>
          <dt>MQTT RTT</dt><dd data-bind="system.master.mqttRtt">—</dd>
        </dl>
      </section>

      <section class="sys-block" aria-label="Esclave">
        <h2>Esclave (balcon, zone A)</h2>
        <dl>
          <dt>État</dt><dd data-bind="system.slave.online">—</dd>
          <dt>RSSI</dt><dd data-bind="system.slave.rssi">—</dd>
          <dt>MAC</dt><dd data-bind="system.slave.mac">—</dd>
        </dl>
      </section>

      <section class="sys-block" aria-label="Pairing">
        <h2>Appairage</h2>
        <dl>
          <dt>Status</dt><dd data-bind="system.pairing.status">—</dd>
          <dt>Depuis</dt><dd data-bind="system.pairing.since">—</dd>
        </dl>
        <button type="button" data-action="pairSlave" class="btn">Re-appairer</button>
      </section>

      <section class="sys-block sys-block-safety" aria-label="Safety">
        <h2>Sécurité</h2>
        <dl>
          <dt>État</dt><dd data-bind="system.safety.state">—</dd>
          <dt>Raison</dt><dd data-bind="system.safety.reason">—</dd>
          <dt>Cooling restant</dt><dd data-bind="system.safety.cooling">—</dd>
        </dl>
        <button type="button" data-action="safetyUnlock" class="btn btn-warning">Unlock SafetyManager</button>
      </section>

      <section class="sys-block sys-block-danger" aria-label="Maintenance">
        <h2>Maintenance</h2>
        <button type="button" data-action="openConfigurator" class="btn">Configurateur</button>
        <button type="button" data-action="reboot" class="btn">Redémarrer</button>
        <button type="button" data-action="factoryReset" class="btn btn-danger">Factory reset</button>
      </section>
    `;

    this.deps.bindings.registerAll({
      'system.master.uptime': () => fmtUptime(this.deps.hardware.get().master.uptime),
      'system.master.ram': () => `${this.deps.hardware.get().master.ramUsed} kB`,
      'system.master.mqttRtt': () => `${this.deps.hardware.get().master.mqttRtt} ms`,
      'system.slave.online': () =>
        this.deps.hardware.get().slaves.SLAVE?.online ? 'ONLINE' : 'OFFLINE',
      'system.slave.rssi': () => `${this.deps.hardware.get().slaves.SLAVE?.rssi ?? '—'} dBm`,
      'system.slave.mac': () => fmtMacShort(this.deps.hardware.get().pairing.slaveMac),
      'system.safety.state': () => this.deps.hardware.get().safety.state,
      'system.safety.reason': () => this.deps.hardware.get().safety.reason ?? '—',
      'system.safety.cooling': () => {
        const s = this.deps.hardware.get().safety.thermalCoolingRemainS;
        return s > 0 ? `${s}s` : '—';
      },
      'system.pairing.status': () => this.deps.hardware.get().pairing.status,
      'system.pairing.since': () => fmtDurationHuman(this.deps.hardware.get().pairing.pairedSince),
    });

    this.clickHandler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
      const action = target?.dataset['action'];
      if (!action) return;
      switch (action) {
        case 'reboot':
        case 'factoryReset':
        case 'safetyUnlock':
        case 'pairSlave':
        case 'openConfigurator':
          this.deps.onAction({ type: action } as SystemAction);
          break;
      }
    };
    root.addEventListener('click', this.clickHandler);
  }

  protected override onActivate(): void {
    this.refresh();
    this.unsub = this.deps.hardware.subscribe(() => this.refresh());
  }

  protected override onDeactivate(): void {
    this.unsub?.();
    this.unsub = null;
  }

  protected override onUnmount(): void {
    if (this.clickHandler && this.root) {
      this.root.removeEventListener('click', this.clickHandler);
    }
    for (const key of BINDING_KEYS) this.deps.bindings.unregister(key);
    this.clickHandler = null;
    if (this.root) this.root.innerHTML = '';
  }

  private refresh(): void {
    if (!this.root) return;
    this.deps.bindings.apply(this.root);
  }
}

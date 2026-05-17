import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MqttBanner } from './mqtt-banner';
import { MqttBridge } from '@/services/mqtt-bridge';
import { HardwareStore } from '@/stores/hardware.store';

function makeBridge(): MqttBridge {
  // Bridge en mode test : injection d'un fake connectFn pour ne pas
  // déclencher de vrai chargement de mqtt.
  return new MqttBridge({
    hardware: new HardwareStore(),
    connectFn: vi.fn() as never,
  });
}

describe('MqttBanner', () => {
  let root: HTMLElement;
  let bridge: MqttBridge;
  let banner: MqttBanner;

  beforeEach(() => {
    root = document.createElement('div');
    bridge = makeBridge();
    banner = new MqttBanner({ root, bridge, autoHideMs: 0 });
  });

  afterEach(() => {
    bridge.dispose();
    banner.unmount();
  });

  it('initial mock state → hidden', () => {
    banner.mount();
    expect(root.hidden).toBe(true);
    expect(root.dataset['state']).toBe('mock');
  });

  it('reflects connecting state', () => {
    banner.mount();
    bridge.dispatchEvent(new CustomEvent('statechange', { detail: 'connecting' }));
    expect(root.hidden).toBe(false);
    expect(root.textContent).toContain('Connexion');
    expect(root.dataset['state']).toBe('connecting');
  });

  it('reflects connected state', () => {
    banner.mount();
    bridge.dispatchEvent(new CustomEvent('statechange', { detail: 'connected' }));
    expect(root.hidden).toBe(false);
    expect(root.textContent).toBe('Live');
  });

  it('connected auto-hides after autoHideMs', () => {
    vi.useFakeTimers();
    banner = new MqttBanner({ root, bridge, autoHideMs: 1500 });
    banner.mount();
    bridge.dispatchEvent(new CustomEvent('statechange', { detail: 'connected' }));
    expect(root.hidden).toBe(false);
    vi.advanceTimersByTime(1600);
    expect(root.hidden).toBe(true);
    vi.useRealTimers();
  });

  it('error state shows reconnect prompt + role=button', () => {
    banner.mount();
    bridge.dispatchEvent(new CustomEvent('statechange', { detail: 'error' }));
    expect(root.hidden).toBe(false);
    expect(root.textContent).toContain('reconnecter');
    expect(root.getAttribute('role')).toBe('button');
  });

  it('click in error state triggers onAction', () => {
    const onAction = vi.fn();
    banner = new MqttBanner({ root, bridge, autoHideMs: 0, onAction });
    banner.mount();
    bridge.dispatchEvent(new CustomEvent('statechange', { detail: 'error' }));
    root.click();
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('unmount detaches listeners', () => {
    const onAction = vi.fn();
    banner = new MqttBanner({ root, bridge, autoHideMs: 0, onAction });
    banner.mount();
    banner.unmount();
    bridge.dispatchEvent(new CustomEvent('statechange', { detail: 'connecting' }));
    // Listener détaché → root pas update
    expect(root.dataset['state']).not.toBe('connecting');
    root.click();
    expect(onAction).not.toHaveBeenCalled();
  });
});

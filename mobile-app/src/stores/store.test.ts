import { describe, it, expect, vi } from 'vitest';
import { Store } from './store';

interface TestState {
  count: number;
  name: string;
}

describe('Store', () => {
  it('get() returns initial state', () => {
    const store = new Store<TestState>({ count: 0, name: 'init' });
    expect(store.get()).toEqual({ count: 0, name: 'init' });
  });

  it('set() replaces full state and emits', () => {
    const store = new Store<TestState>({ count: 0, name: 'a' });
    const spy = vi.fn();
    store.subscribe(spy);

    store.set({ count: 42, name: 'b' });

    expect(store.get()).toEqual({ count: 42, name: 'b' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ count: 42, name: 'b' });
  });

  it('patch() merges and emits', () => {
    const store = new Store<TestState>({ count: 0, name: 'a' });
    const spy = vi.fn();
    store.subscribe(spy);

    store.patch({ count: 1 });

    expect(store.get()).toEqual({ count: 1, name: 'a' }); // name preserved
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('update() with new state emits, returns same/undefined skips', () => {
    const store = new Store<TestState>({ count: 0, name: 'a' });
    const spy = vi.fn();
    store.subscribe(spy);

    store.update((s) => ({ ...s, count: s.count + 1 }));
    expect(store.get().count).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);

    store.update(() => undefined);
    expect(spy).toHaveBeenCalledTimes(1); // pas de re-emit

    store.update(() => null as unknown as TestState);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('subscribe returns unsubscribe fn', () => {
    const store = new Store<TestState>({ count: 0, name: 'x' });
    const spy = vi.fn();
    const unsub = store.subscribe(spy);

    store.patch({ count: 1 });
    expect(spy).toHaveBeenCalledTimes(1);

    unsub();
    store.patch({ count: 2 });
    expect(spy).toHaveBeenCalledTimes(1); // still 1
  });

  it('multiple subscribers all called', () => {
    const store = new Store<TestState>({ count: 0, name: 'x' });
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.subscribe(c);

    store.patch({ count: 1 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('listener throwing does not block other listeners', () => {
    const store = new Store<TestState>({ count: 0, name: 'x' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = vi.fn(() => {
      throw new Error('boom');
    });
    const ok = vi.fn();
    store.subscribe(failing);
    store.subscribe(ok);

    store.patch({ count: 1 });

    expect(failing).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('listenerCount tracks subscribers', () => {
    const store = new Store<TestState>({ count: 0, name: 'x' });
    expect(store.listenerCount()).toBe(0);
    const unsub1 = store.subscribe(vi.fn());
    const unsub2 = store.subscribe(vi.fn());
    expect(store.listenerCount()).toBe(2);
    unsub1();
    expect(store.listenerCount()).toBe(1);
    unsub2();
    expect(store.listenerCount()).toBe(0);
  });

  it('snapshot of listeners — newly added mid-emit not invoked this turn', () => {
    const store = new Store<TestState>({ count: 0, name: 'x' });
    const late = vi.fn();
    const early = vi.fn(() => {
      store.subscribe(late);
    });
    store.subscribe(early);

    store.patch({ count: 1 });

    expect(early).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledTimes(0); // pas appelé dans cette émission

    // mais appelé à la prochaine
    store.patch({ count: 2 });
    expect(late).toHaveBeenCalledTimes(1);
  });
});

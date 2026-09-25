import { describe, expect, it } from 'vitest';

import { usePresenceStore } from './presence-store.js';

describe('presence-store', () => {
  it('applySnapshot оставляет только онлайн из снимка', () => {
    usePresenceStore.getState().setStatus('u-old', 'online');
    usePresenceStore.getState().applySnapshot([{ id: 'u-1' }, { id: 'u-2' }]);
    const online = Object.keys(usePresenceStore.getState().online);
    expect(online).toEqual(['u-1', 'u-2']);
  });

  it('setStatus переключает онлайн/офлайн', () => {
    usePresenceStore.getState().reset();
    usePresenceStore.getState().setStatus('u-1', 'online');
    expect(usePresenceStore.getState().online['u-1']).toBe(true);
    usePresenceStore.getState().setStatus('u-1', 'offline');
    expect(usePresenceStore.getState().online['u-1']).toBeUndefined();
  });
});

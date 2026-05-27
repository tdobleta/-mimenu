import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    auth: { refreshSession: vi.fn(async () => ({})) },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/offlineQueue', () => ({
  getActive: vi.fn(async () => []),
  dequeue: vi.fn(async () => {}),
  updateOp: vi.fn(async () => {}),
  countActive: vi.fn(async () => 0),
  countFailed: vi.fn(async () => 0),
  clearFailed: vi.fn(async () => {}),
  retryFailed: vi.fn(async () => 0),
}));

import { useOfflineSync } from '@/lib/offlineSync';
import { getActive } from '@/lib/offlineQueue';

describe('useOfflineSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drains the queue immediately when a manual retry event is dispatched', async () => {
    const { unmount } = renderHook(() => useOfflineSync());

    await waitFor(() => expect(getActive).toHaveBeenCalled());
    vi.mocked(getActive).mockClear();

    act(() => {
      window.dispatchEvent(new CustomEvent('mimenu-offline-retry'));
    });

    await waitFor(() => expect(getActive).toHaveBeenCalled());
    unmount();
  });
});

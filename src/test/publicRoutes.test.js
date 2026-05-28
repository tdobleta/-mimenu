import { describe, expect, it } from 'vitest';
import { buildPublicKitchenUrl, buildPublicReservationUrl } from '@/lib/publicRoutes';

describe('publicRoutes', () => {
  it('builds canonical reservation URLs without the Vite /public prefix', () => {
    expect(buildPublicReservationUrl('https://app.example.com/', 'branch 1')).toBe(
      'https://app.example.com/reservar/branch%201'
    );
  });

  it('builds canonical kitchen device URLs with branch and token query params', () => {
    expect(buildPublicKitchenUrl('https://app.example.com/', 'branch-1', 'abc123')).toBe(
      'https://app.example.com/monitor-cocina?branch=branch-1&token=abc123'
    );
  });
});

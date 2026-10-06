import { describe, expect, it } from 'vitest';

import { isPrivateIpAddress } from './ip-ranges.js';

/** Приватные/зарезервированные диапазоны SSRF-гварда (#212, security-ревью). */

describe('isPrivateIpAddress', () => {
  it('RFC1918 — приватные', () => {
    for (const ip of [
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.1',
    ]) {
      expect(isPrivateIpAddress(ip), ip).toBe(true);
    }
  });

  it('loopback/link-local/CGNAT/multicast/zero — приватные', () => {
    for (const ip of [
      '127.0.0.1',
      '0.0.0.0',
      '169.254.169.254', // cloud metadata
      '100.64.0.1',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isPrivateIpAddress(ip), ip).toBe(true);
    }
  });

  it('публичные — false', () => {
    for (const ip of ['93.184.216.34', '172.32.0.1', '192.169.1.1', '8.8.8.8', '100.128.0.1']) {
      expect(isPrivateIpAddress(ip), ip).toBe(false);
    }
  });

  it('IPv6: loopback/ULA/link-local/multicast — приватные; публичный — false', () => {
    expect(isPrivateIpAddress('::1')).toBe(true);
    expect(isPrivateIpAddress('::')).toBe(true);
    expect(isPrivateIpAddress('fd00::1')).toBe(true);
    expect(isPrivateIpAddress('fc12::1')).toBe(true);
    expect(isPrivateIpAddress('fe80::1')).toBe(true);
    expect(isPrivateIpAddress('ff02::1')).toBe(true);
    expect(isPrivateIpAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });

  it('v4-mapped IPv6 сводится к v4-проверке', () => {
    expect(isPrivateIpAddress('::ffff:192.168.1.1')).toBe(true);
    expect(isPrivateIpAddress('::ffff:93.184.216.34')).toBe(false);
  });
});

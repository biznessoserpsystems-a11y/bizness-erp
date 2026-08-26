const { ipMatchesAllowlist, normalizeToCidr } = require('../utils/ipAllowlist');

describe('ipMatchesAllowlist', () => {
  test('matches an IP within a CIDR range', () => {
    expect(ipMatchesAllowlist('203.0.113.5', ['203.0.113.0/24'])).toBe(true);
  });

  test('rejects an IP outside every rule', () => {
    expect(ipMatchesAllowlist('198.51.100.1', ['203.0.113.0/24'])).toBe(false);
  });

  test('matches a bare single-address rule (already normalized to /32)', () => {
    expect(ipMatchesAllowlist('203.0.113.5', ['203.0.113.5/32'])).toBe(true);
    expect(ipMatchesAllowlist('203.0.113.6', ['203.0.113.5/32'])).toBe(false);
  });

  test('an empty rule list matches nothing - fails closed, not open', () => {
    expect(ipMatchesAllowlist('203.0.113.5', [])).toBe(false);
  });

  test('checks against every rule, matching if any one of several applies', () => {
    const rules = ['10.0.0.0/8', '203.0.113.0/24', '198.51.100.0/24'];
    expect(ipMatchesAllowlist('203.0.113.99', rules)).toBe(true);
    expect(ipMatchesAllowlist('192.0.2.1', rules)).toBe(false);
  });

  // The real gotcha confirmed directly against the library before
  // writing this function: Express (and this app's own server, which
  // listens on both stacks) can report a request's IP as an
  // IPv4-mapped IPv6 address. A rule of "203.0.113.0/24" must still
  // match a real visitor from that address reported this way.
  test('matches an IPv4-mapped IPv6 request address against a plain IPv4 rule', () => {
    expect(ipMatchesAllowlist('::ffff:203.0.113.5', ['203.0.113.0/24'])).toBe(true);
    expect(ipMatchesAllowlist('::ffff:198.51.100.1', ['203.0.113.0/24'])).toBe(false);
  });

  test('an unparseable request IP never matches, rather than throwing', () => {
    expect(() => ipMatchesAllowlist('not-an-ip', ['203.0.113.0/24'])).not.toThrow();
    expect(ipMatchesAllowlist('not-an-ip', ['203.0.113.0/24'])).toBe(false);
  });

  test('a malformed stored rule is skipped rather than crashing the whole check', () => {
    expect(() => ipMatchesAllowlist('203.0.113.5', ['not-a-cidr', '203.0.113.0/24'])).not.toThrow();
    expect(ipMatchesAllowlist('203.0.113.5', ['not-a-cidr', '203.0.113.0/24'])).toBe(true);
  });

  // Confirmed directly against the library: comparing an IPv4 address
  // to an IPv6 range throws rather than returning false. A company
  // with a mix of IPv4 and IPv6 rules must never have one mismatched
  // comparison take down the entire check.
  test('an IPv4 request against an IPv6-only rule set does not throw, and correctly does not match', () => {
    expect(() => ipMatchesAllowlist('203.0.113.5', ['2001:db8::/32'])).not.toThrow();
    expect(ipMatchesAllowlist('203.0.113.5', ['2001:db8::/32'])).toBe(false);
  });

  test('matches real IPv6 addresses and ranges too, not just IPv4', () => {
    expect(ipMatchesAllowlist('2001:db8::1', ['2001:db8::/32'])).toBe(true);
    expect(ipMatchesAllowlist('2001:db9::1', ['2001:db8::/32'])).toBe(false);
  });
});

describe('normalizeToCidr', () => {
  test('a bare IPv4 address gets /32 appended', () => {
    expect(normalizeToCidr('203.0.113.5')).toBe('203.0.113.5/32');
  });

  test('a bare IPv6 address gets /128 appended', () => {
    expect(normalizeToCidr('2001:db8::1')).toBe('2001:db8::1/128');
  });

  test('an already-valid CIDR is left unchanged', () => {
    expect(normalizeToCidr('203.0.113.0/24')).toBe('203.0.113.0/24');
  });

  test('throws on genuinely invalid input, for the caller to turn into a 400', () => {
    expect(() => normalizeToCidr('not-an-ip')).toThrow();
    expect(() => normalizeToCidr('999.999.999.999')).toThrow();
  });

  test('surrounding whitespace does not prevent normalization', () => {
    expect(normalizeToCidr('  203.0.113.5  ')).toBe('203.0.113.5/32');
  });
});

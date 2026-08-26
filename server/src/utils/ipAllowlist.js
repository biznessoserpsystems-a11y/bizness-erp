const ipaddr = require('ipaddr.js');

/**
 * Returns true if requestIp matches at least one of the given CIDR
 * rules. Both the incoming request IP and every stored rule are run
 * through ipaddr.process(), which normalizes an IPv4-mapped IPv6
 * address (::ffff:203.0.113.5 — common when a server listens on both
 * IPv4 and IPv6, exactly this app's setup) down to plain IPv4 before
 * comparing. Without this, a perfectly correct "203.0.113.0/24" rule
 * would silently fail to match a real visitor from that exact address,
 * for a reason that would be genuinely confusing to debug in production.
 *
 * Fails closed throughout: an empty rule list, an unparseable request
 * IP, or a malformed stored rule are all treated as "does not match"
 * rather than allowed through or thrown as an unhandled error — a
 * broken IP allowlist should never crash the login endpoint, and it
 * should never accidentally let everyone in either.
 */
function ipMatchesAllowlist(requestIp, cidrRules) {
  if (!cidrRules || !cidrRules.length) return false;

  let parsedRequestIp;
  try {
    parsedRequestIp = ipaddr.process(requestIp);
  } catch {
    return false;
  }

  return cidrRules.some((cidr) => {
    try {
      const range = ipaddr.parseCIDR(cidr);
      // .match() throws (rather than returning false) when comparing
      // across IP versions — confirmed directly, not assumed — so a
      // company with a mix of IPv4 and IPv6 rules must never let one
      // mismatched comparison take down the whole check.
      if (parsedRequestIp.kind() !== range[0].kind()) return false;
      return parsedRequestIp.match(range);
    } catch {
      return false;
    }
  });
}

/**
 * Normalizes a single IP ("203.0.113.5") or an already-valid CIDR
 * ("203.0.113.0/24") into a stored CIDR string, appending /32 (IPv4) or
 * /128 (IPv6) to a bare address so every row in ip_allowlist_rules is
 * always a real CIDR range. Throws on genuinely invalid input, which
 * the caller turns into a 400.
 */
function normalizeToCidr(input) {
  const trimmed = (input || '').trim();
  if (trimmed.includes('/')) {
    ipaddr.parseCIDR(trimmed);
    return trimmed;
  }
  const parsed = ipaddr.parse(trimmed);
  const bits = parsed.kind() === 'ipv6' ? 128 : 32;
  return `${trimmed}/${bits}`;
}

module.exports = { ipMatchesAllowlist, normalizeToCidr };

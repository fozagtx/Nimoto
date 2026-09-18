/** Nimiq user-friendly addresses: `NQ` + 2 check digits + 32 base-32 characters. */
const ADDRESS_BODY = /^NQ[0-9]{2}[0-9A-HJ-NP-VXY]{32}$/;

export function normalizeAddress(address: string): string {
  return address.replace(/\s+/g, '').toUpperCase();
}

/** Formats an address in the canonical space-separated form. */
export function formatAddress(address: string): string {
  const compact = normalizeAddress(address);
  return (compact.match(/.{1,4}/g) ?? []).join(' ');
}

/** Validates the address shape and its IBAN-style mod-97 checksum. */
export function isValidAddress(address: string): boolean {
  const compact = normalizeAddress(address);
  if (!ADDRESS_BODY.test(compact)) return false;
  return ibanCheck(compact) === 1;
}

/** Mirrors Nimiq's IBAN-style checksum: letters expand to their numeric value. */
function ibanCheck(address: string): number {
  const rearranged = address.slice(4) + address.slice(0, 4);
  const digits = [...rearranged]
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 48 && code <= 57 ? char : String(code - 55);
    })
    .join('');
  let remainder = 0;
  for (const digit of digits) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

/** Leaderboard identity stays auditable: `NQ12…ABCD`. */
export function abbreviateAddress(address: string): string {
  const compact = normalizeAddress(address);
  if (compact.length <= 10) return compact;
  return `${compact.slice(0, 4)}…${compact.slice(-4)}`;
}

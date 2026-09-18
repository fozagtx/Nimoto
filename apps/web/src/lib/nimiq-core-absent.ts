/**
 * Stands in for @nimiq/core in builds without the mock wallet, so the WASM
 * crypto bundle never ships to real users.
 */
function unavailable(): never {
  throw new Error('@nimiq/core is only bundled when VITE_USE_MOCK_NIMIQ=true');
}

export const KeyPair = { derive: unavailable };
export const Hash = { computeSha256: unavailable };
export class PrivateKey {
  constructor(_bytes: Uint8Array) {
    unavailable();
  }
}

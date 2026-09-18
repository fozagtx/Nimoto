import { KeyPair } from '@nimiq/core';

const keyPair = KeyPair.generate();

console.log('# Nimiq treasury keypair — store in your host\'s secret manager, never in git.');
console.log(`TREASURY_PRIVATE_KEY=${keyPair.privateKey.toHex()}`);
console.log(`TREASURY_ADDRESS=${keyPair.toAddress().toUserFriendlyAddress()}`);

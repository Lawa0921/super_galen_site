import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import { buildSignInMessage, verifySignature } from './auth';

describe('verifySignature', () => {
  it('正確簽章 → 驗證通過', async () => {
    const w = Wallet.createRandom();
    const msg = buildSignInMessage('abc123');
    const sig = await w.signMessage(msg);
    expect(verifySignature(msg, sig, w.address)).toBe(true);
  });

  it('用別人的地址驗 → false', async () => {
    const signer = Wallet.createRandom();
    const other = Wallet.createRandom();
    const msg = buildSignInMessage('n1');
    const sig = await signer.signMessage(msg);
    expect(verifySignature(msg, sig, other.address)).toBe(false);
  });

  it('訊息被竄改 → false', async () => {
    const w = Wallet.createRandom();
    const sig = await w.signMessage(buildSignInMessage('n1'));
    expect(verifySignature(buildSignInMessage('n2'), sig, w.address)).toBe(false);
  });

  it('壞簽章不丟例外、回 false', () => {
    expect(verifySignature('msg', '0xnotasig', '0x0000000000000000000000000000000000000000')).toBe(false);
  });
});

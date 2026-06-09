import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import { buildSignInMessage, verifySignature, buildFfaResultMessage } from './auth';

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

describe('buildFfaResultMessage', () => {
  it('相同輸入 → 相同字串（穩定可重建）', () => {
    const m1 = buildFfaResultMessage('mbr', ['0xA', '0xB', '0xC'], [1, 2, 3]);
    const m2 = buildFfaResultMessage('mbr', ['0xA', '0xB', '0xC'], [1, 2, 3]);
    expect(m1).toBe(m2);
  });

  it('不同 matchId → 不同字串', () => {
    const m1 = buildFfaResultMessage('mbr1', ['0xA', '0xB'], [1, 2]);
    const m2 = buildFfaResultMessage('mbr2', ['0xA', '0xB'], [1, 2]);
    expect(m1).not.toBe(m2);
  });

  it('不同名次 → 不同字串', () => {
    const m1 = buildFfaResultMessage('mbr', ['0xA', '0xB'], [1, 2]);
    const m2 = buildFfaResultMessage('mbr', ['0xA', '0xB'], [2, 1]);
    expect(m1).not.toBe(m2);
  });

  it('訊息含 matchId', () => {
    expect(buildFfaResultMessage('mbr-xyz', ['0xA'], [1])).toContain('mbr-xyz');
  });
});

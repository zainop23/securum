import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../auth/password';

describe('Password Hashing', () => {
  it('should hash a password and verify it correctly', async () => {
    const plain = 'SecurePass1';
    const hash = await hashPassword(plain);

    // Hash should be a bcrypt hash string
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash.length).toBeGreaterThan(50);

    // Verification should succeed with correct password
    const isValid = await verifyPassword(plain, hash);
    expect(isValid).toBe(true);

    // Verification should fail with wrong password
    const isInvalid = await verifyPassword('WrongPassword1', hash);
    expect(isInvalid).toBe(false);
  });

  it('should produce different hashes for the same password (salted)', async () => {
    const plain = 'SamePassword1';
    const hash1 = await hashPassword(plain);
    const hash2 = await hashPassword(plain);

    expect(hash1).not.toBe(hash2);

    // Both should still verify correctly
    expect(await verifyPassword(plain, hash1)).toBe(true);
    expect(await verifyPassword(plain, hash2)).toBe(true);
  });

  it('should handle empty string password', async () => {
    const hash = await hashPassword('');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(await verifyPassword('', hash)).toBe(true);
    expect(await verifyPassword('notempty', hash)).toBe(false);
  });

  it('should handle long passwords', async () => {
    const longPass = 'A'.repeat(72); // bcrypt max
    const hash = await hashPassword(longPass);
    expect(await verifyPassword(longPass, hash)).toBe(true);
  });
});

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * EncryptionService
 *
 * Provides two distinct capabilities:
 *
 * 1. At-rest symmetric encryption (AES-256-CBC) for non-DM fields that the
 *    backend legitimately needs to read (e.g. configuration values, tokens).
 *    These helpers (`encrypt`/`decrypt`) MUST NOT be used for direct messages.
 *
 * 2. End-to-end encrypted direct message storage. Direct messages are
 *    encrypted in the client using the recipient's public key. The backend
 *    only ever sees and stores opaque ciphertext. Because the backend never
 *    holds any user's private key, it CANNOT decrypt direct message content.
 *    The `storeCiphertext`/`getCiphertext` helpers are strict pass-throughs
 *    that validate the payload shape and never attempt decryption.
 */
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;

  /**
   * Ciphertext envelope format for E2E direct messages:
   *   v1:<keyId>:<base64-iv>:<base64-ciphertext>:<base64-authTag>
   * The `keyId` identifies which recipient public key (and therefore which
   * private key) the message was encrypted to, enabling key rotation.
   */
  private readonly dmCiphertextPattern =
    /^v1:[A-Za-z0-9._-]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

  constructor(private configService: ConfigService) {
    const secret =
      this.configService.get<string>('ENCRYPTION_KEY') ||
      'default-very-long-and-secure-secret-key-32-chars-long';
    this.key = crypto.scryptSync(secret, 'salt', 32);
  }

  // ---------------------------------------------------------------------------
  // At-rest symmetric encryption (NOT for direct messages)
  // ---------------------------------------------------------------------------

  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  decrypt(encryptedText: string): string {
    if (!encryptedText) return '';
    try {
      const [ivHex, dataHex] = encryptedText.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      let decrypted = decipher.update(dataHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed');
    }
  }

  // ---------------------------------------------------------------------------
  // End-to-end encrypted direct messages
  //
  // The backend holds NO private keys for users. Direct message content is
  // encrypted client-side to the recipient's public key and is stored here as
  // opaque ciphertext. There is intentionally no `decryptDirectMessage` method:
  // the backend is architecturally incapable of reading DM content.
  // ---------------------------------------------------------------------------

  /**
   * Validates that a payload looks like a well-formed E2E ciphertext envelope.
   * Rejects plaintext-looking payloads so that unencrypted content can never
   * be persisted as a direct message.
   */
  validateCiphertext(ciphertext: string): boolean {
    if (!ciphertext || typeof ciphertext !== 'string') return false;
    return this.dmCiphertextPattern.test(ciphertext);
  }

  /**
   * Validates and returns the ciphertext to be persisted for a direct message.
   * This is a strict pass-through: no encryption or decryption is performed
   * server-side. Throws if the payload is not a valid ciphertext envelope,
   * preventing plaintext from reaching the database.
   */
  storeCiphertext(ciphertext: string): string {
    if (!this.validateCiphertext(ciphertext)) {
      throw new Error(
        'Invalid direct message ciphertext: payload must be client-encrypted',
      );
    }
    return ciphertext;
  }

  /**
   * Returns the stored ciphertext for a direct message. The backend cannot and
   * does not decrypt it; the value is returned verbatim so the client can
   * decrypt it with the recipient's private key.
   */
  getCiphertext(storedCiphertext: string): string {
    if (!storedCiphertext) return '';
    if (!this.validateCiphertext(storedCiphertext)) {
      throw new Error('Stored direct message is not valid ciphertext');
    }
    return storedCiphertext;
  }

  /**
   * Extracts the key identifier from a ciphertext envelope. Used to determine
   * whether a message was encrypted to a rotated (now invalid) key.
   */
  getKeyId(ciphertext: string): string | null {
    if (!this.validateCiphertext(ciphertext)) return null;
    const parts = ciphertext.split(':');
    return parts.length >= 2 ? parts[1] : null;
  }
}
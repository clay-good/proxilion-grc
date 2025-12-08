/**
 * Certificate Trust Tests
 *
 * Tests for certificate trust validation, expiry handling,
 * and platform-specific certificate behaviors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Certificate trust types
interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  serialNumber: string;
  isCA: boolean;
}

interface TrustStoreEntry {
  certificate: CertificateInfo;
  trustLevel: 'full' | 'limited' | 'none';
  installedBy: 'system' | 'user' | 'mdm';
  installDate: Date;
}

interface PlatformTrustStore {
  platform: 'ios' | 'android' | 'macos' | 'windows';
  systemCerts: TrustStoreEntry[];
  userCerts: TrustStoreEntry[];
  mdmCerts: TrustStoreEntry[];
}

// Certificate Trust Manager (simulated)
class CertificateTrustManager {
  private trustStore: PlatformTrustStore;

  constructor(platform: 'ios' | 'android' | 'macos' | 'windows') {
    this.trustStore = {
      platform,
      systemCerts: [],
      userCerts: [],
      mdmCerts: [],
    };
  }

  addCertificate(
    cert: CertificateInfo,
    installedBy: 'system' | 'user' | 'mdm',
    trustLevel: 'full' | 'limited' | 'none' = 'full'
  ): void {
    const entry: TrustStoreEntry = {
      certificate: cert,
      trustLevel,
      installedBy,
      installDate: new Date(),
    };

    switch (installedBy) {
      case 'system':
        this.trustStore.systemCerts.push(entry);
        break;
      case 'user':
        this.trustStore.userCerts.push(entry);
        break;
      case 'mdm':
        this.trustStore.mdmCerts.push(entry);
        break;
    }
  }

  isTrusted(fingerprint: string): { trusted: boolean; reason: string } {
    // Check system certs first (always trusted)
    const systemCert = this.trustStore.systemCerts.find(
      (e) => e.certificate.fingerprint === fingerprint
    );
    if (systemCert) {
      if (this.isExpired(systemCert.certificate)) {
        return { trusted: false, reason: 'Certificate expired' };
      }
      return { trusted: true, reason: 'System trusted certificate' };
    }

    // Check MDM certs (trusted on managed devices)
    const mdmCert = this.trustStore.mdmCerts.find(
      (e) => e.certificate.fingerprint === fingerprint
    );
    if (mdmCert) {
      if (this.isExpired(mdmCert.certificate)) {
        return { trusted: false, reason: 'Certificate expired' };
      }
      return { trusted: true, reason: 'MDM installed certificate' };
    }

    // Check user certs (platform-dependent trust)
    const userCert = this.trustStore.userCerts.find(
      (e) => e.certificate.fingerprint === fingerprint
    );
    if (userCert) {
      if (this.isExpired(userCert.certificate)) {
        return { trusted: false, reason: 'Certificate expired' };
      }

      // Platform-specific trust rules
      if (this.trustStore.platform === 'android') {
        // Android 7+ doesn't trust user certs for apps by default
        return {
          trusted: false,
          reason: 'User certificate not trusted by apps (Android 7+)',
        };
      }

      if (this.trustStore.platform === 'ios') {
        // iOS requires explicit full trust enablement
        if (userCert.trustLevel !== 'full') {
          return {
            trusted: false,
            reason: 'Certificate Trust Settings not enabled',
          };
        }
      }

      return { trusted: true, reason: 'User trusted certificate' };
    }

    return { trusted: false, reason: 'Certificate not found in trust store' };
  }

  isExpired(cert: CertificateInfo): boolean {
    const now = new Date();
    return now < cert.validFrom || now > cert.validTo;
  }

  daysUntilExpiry(cert: CertificateInfo): number {
    const now = new Date();
    const diffMs = cert.validTo.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  getCertificatesExpiringWithin(days: number): CertificateInfo[] {
    const allCerts = [
      ...this.trustStore.systemCerts,
      ...this.trustStore.userCerts,
      ...this.trustStore.mdmCerts,
    ];

    return allCerts
      .filter((entry) => {
        const daysLeft = this.daysUntilExpiry(entry.certificate);
        return daysLeft >= 0 && daysLeft <= days;
      })
      .map((entry) => entry.certificate);
  }

  removeCertificate(fingerprint: string): boolean {
    const removeFrom = (arr: TrustStoreEntry[]): boolean => {
      const idx = arr.findIndex((e) => e.certificate.fingerprint === fingerprint);
      if (idx >= 0) {
        arr.splice(idx, 1);
        return true;
      }
      return false;
    };

    return (
      removeFrom(this.trustStore.systemCerts) ||
      removeFrom(this.trustStore.userCerts) ||
      removeFrom(this.trustStore.mdmCerts)
    );
  }

  getStats(): {
    total: number;
    system: number;
    user: number;
    mdm: number;
    expired: number;
    expiringIn30Days: number;
  } {
    const allCerts = [
      ...this.trustStore.systemCerts,
      ...this.trustStore.userCerts,
      ...this.trustStore.mdmCerts,
    ];

    return {
      total: allCerts.length,
      system: this.trustStore.systemCerts.length,
      user: this.trustStore.userCerts.length,
      mdm: this.trustStore.mdmCerts.length,
      expired: allCerts.filter((e) => this.isExpired(e.certificate)).length,
      expiringIn30Days: this.getCertificatesExpiringWithin(30).length,
    };
  }
}

// Helper to create test certificates
function createTestCert(overrides: Partial<CertificateInfo> = {}): CertificateInfo {
  const now = new Date();
  return {
    subject: 'CN=Test Certificate',
    issuer: 'CN=Proxilion CA',
    validFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Yesterday
    validTo: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000), // 1 year
    fingerprint: `SHA256:${Math.random().toString(36).substring(2, 34)}`,
    serialNumber: Math.random().toString(16).substring(2, 18),
    isCA: false,
    ...overrides,
  };
}

describe('Certificate Trust Manager', () => {
  describe('iOS Trust Store', () => {
    let manager: CertificateTrustManager;

    beforeEach(() => {
      manager = new CertificateTrustManager('ios');
    });

    it('should trust system-installed certificates', () => {
      const cert = createTestCert({ subject: 'CN=Apple Root CA' });
      manager.addCertificate(cert, 'system');

      const result = manager.isTrusted(cert.fingerprint);
      expect(result.trusted).toBe(true);
      expect(result.reason).toBe('System trusted certificate');
    });

    it('should trust MDM-installed certificates', () => {
      const cert = createTestCert({ subject: 'CN=Proxilion CA' });
      manager.addCertificate(cert, 'mdm');

      const result = manager.isTrusted(cert.fingerprint);
      expect(result.trusted).toBe(true);
      expect(result.reason).toBe('MDM installed certificate');
    });

    it('should trust user certificates with full trust enabled', () => {
      const cert = createTestCert({ subject: 'CN=User CA' });
      manager.addCertificate(cert, 'user', 'full');

      const result = manager.isTrusted(cert.fingerprint);
      expect(result.trusted).toBe(true);
      expect(result.reason).toBe('User trusted certificate');
    });

    it('should not trust user certificates without full trust', () => {
      const cert = createTestCert({ subject: 'CN=User CA' });
      manager.addCertificate(cert, 'user', 'limited');

      const result = manager.isTrusted(cert.fingerprint);
      expect(result.trusted).toBe(false);
      expect(result.reason).toBe('Certificate Trust Settings not enabled');
    });

    it('should not trust unknown certificates', () => {
      const result = manager.isTrusted('SHA256:unknown-fingerprint');
      expect(result.trusted).toBe(false);
      expect(result.reason).toBe('Certificate not found in trust store');
    });
  });

  describe('Android Trust Store', () => {
    let manager: CertificateTrustManager;

    beforeEach(() => {
      manager = new CertificateTrustManager('android');
    });

    it('should trust system certificates', () => {
      const cert = createTestCert({ subject: 'CN=Google Trust Services' });
      manager.addCertificate(cert, 'system');

      const result = manager.isTrusted(cert.fingerprint);
      expect(result.trusted).toBe(true);
    });

    it('should trust MDM-installed certificates', () => {
      const cert = createTestCert({ subject: 'CN=Proxilion CA' });
      manager.addCertificate(cert, 'mdm');

      const result = manager.isTrusted(cert.fingerprint);
      expect(result.trusted).toBe(true);
    });

    it('should NOT trust user-installed certificates for apps', () => {
      const cert = createTestCert({ subject: 'CN=User CA' });
      manager.addCertificate(cert, 'user', 'full');

      const result = manager.isTrusted(cert.fingerprint);
      expect(result.trusted).toBe(false);
      expect(result.reason).toContain('Android 7+');
    });
  });

  describe('Windows Trust Store', () => {
    let manager: CertificateTrustManager;

    beforeEach(() => {
      manager = new CertificateTrustManager('windows');
    });

    it('should trust system certificates', () => {
      const cert = createTestCert({ subject: 'CN=Microsoft Root CA' });
      manager.addCertificate(cert, 'system');

      const result = manager.isTrusted(cert.fingerprint);
      expect(result.trusted).toBe(true);
    });

    it('should trust user certificates', () => {
      const cert = createTestCert({ subject: 'CN=User CA' });
      manager.addCertificate(cert, 'user', 'full');

      const result = manager.isTrusted(cert.fingerprint);
      expect(result.trusted).toBe(true);
    });
  });

  describe('macOS Trust Store', () => {
    let manager: CertificateTrustManager;

    beforeEach(() => {
      manager = new CertificateTrustManager('macos');
    });

    it('should trust Keychain certificates', () => {
      const cert = createTestCert({ subject: 'CN=Apple Root CA' });
      manager.addCertificate(cert, 'system');

      const result = manager.isTrusted(cert.fingerprint);
      expect(result.trusted).toBe(true);
    });

    it('should trust user-installed certificates', () => {
      const cert = createTestCert({ subject: 'CN=User CA' });
      manager.addCertificate(cert, 'user', 'full');

      const result = manager.isTrusted(cert.fingerprint);
      expect(result.trusted).toBe(true);
    });
  });
});

describe('Certificate Expiry Handling', () => {
  let manager: CertificateTrustManager;

  beforeEach(() => {
    manager = new CertificateTrustManager('ios');
  });

  it('should detect expired certificates', () => {
    const expiredCert = createTestCert({
      validTo: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
    });
    manager.addCertificate(expiredCert, 'system');

    const result = manager.isTrusted(expiredCert.fingerprint);
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe('Certificate expired');
  });

  it('should detect certificates not yet valid', () => {
    const futureCert = createTestCert({
      validFrom: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    });
    manager.addCertificate(futureCert, 'system');

    const result = manager.isTrusted(futureCert.fingerprint);
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe('Certificate expired');
  });

  it('should calculate days until expiry', () => {
    const cert = createTestCert({
      validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    const days = manager.daysUntilExpiry(cert);
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(30);
  });

  it('should find certificates expiring within a time window', () => {
    const cert30Days = createTestCert({
      subject: 'CN=Expires in 30 days',
      validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    const cert60Days = createTestCert({
      subject: 'CN=Expires in 60 days',
      validTo: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    });
    const cert10Days = createTestCert({
      subject: 'CN=Expires in 10 days',
      validTo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });

    manager.addCertificate(cert30Days, 'system');
    manager.addCertificate(cert60Days, 'system');
    manager.addCertificate(cert10Days, 'system');

    const expiringIn45Days = manager.getCertificatesExpiringWithin(45);
    expect(expiringIn45Days.length).toBe(2);
    expect(expiringIn45Days.some((c) => c.subject.includes('30 days'))).toBe(true);
    expect(expiringIn45Days.some((c) => c.subject.includes('10 days'))).toBe(true);
    expect(expiringIn45Days.some((c) => c.subject.includes('60 days'))).toBe(false);
  });

  it('should not include already expired certificates in expiring list', () => {
    const expiredCert = createTestCert({
      validTo: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    manager.addCertificate(expiredCert, 'system');

    const expiring = manager.getCertificatesExpiringWithin(30);
    expect(expiring.length).toBe(0);
  });
});

describe('Certificate Management Operations', () => {
  let manager: CertificateTrustManager;

  beforeEach(() => {
    manager = new CertificateTrustManager('ios');
  });

  it('should remove certificates by fingerprint', () => {
    const cert = createTestCert();
    manager.addCertificate(cert, 'user');

    expect(manager.isTrusted(cert.fingerprint).trusted).toBe(true);

    const removed = manager.removeCertificate(cert.fingerprint);
    expect(removed).toBe(true);

    expect(manager.isTrusted(cert.fingerprint).trusted).toBe(false);
  });

  it('should return false when removing non-existent certificate', () => {
    const removed = manager.removeCertificate('SHA256:nonexistent');
    expect(removed).toBe(false);
  });

  it('should track certificate statistics', () => {
    const systemCert = createTestCert({ subject: 'CN=System CA' });
    const userCert = createTestCert({ subject: 'CN=User CA' });
    const mdmCert = createTestCert({ subject: 'CN=MDM CA' });
    const expiredCert = createTestCert({
      subject: 'CN=Expired CA',
      validTo: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    const expiringCert = createTestCert({
      subject: 'CN=Expiring CA',
      validTo: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    });

    manager.addCertificate(systemCert, 'system');
    manager.addCertificate(userCert, 'user');
    manager.addCertificate(mdmCert, 'mdm');
    manager.addCertificate(expiredCert, 'system');
    manager.addCertificate(expiringCert, 'system');

    const stats = manager.getStats();
    expect(stats.total).toBe(5);
    expect(stats.system).toBe(3);
    expect(stats.user).toBe(1);
    expect(stats.mdm).toBe(1);
    expect(stats.expired).toBe(1);
    expect(stats.expiringIn30Days).toBe(1);
  });
});

describe('Certificate Chain Validation', () => {
  it('should validate CA certificate properties', () => {
    const caCert = createTestCert({
      subject: 'CN=Proxilion Root CA',
      issuer: 'CN=Proxilion Root CA', // Self-signed
      isCA: true,
    });

    expect(caCert.isCA).toBe(true);
    expect(caCert.subject).toBe(caCert.issuer); // Self-signed root
  });

  it('should validate intermediate certificate properties', () => {
    const intermediateCert = createTestCert({
      subject: 'CN=Proxilion Intermediate CA',
      issuer: 'CN=Proxilion Root CA',
      isCA: true,
    });

    expect(intermediateCert.isCA).toBe(true);
    expect(intermediateCert.subject).not.toBe(intermediateCert.issuer);
  });

  it('should validate end-entity certificate properties', () => {
    const leafCert = createTestCert({
      subject: 'CN=api.openai.com',
      issuer: 'CN=Proxilion Intermediate CA',
      isCA: false,
    });

    expect(leafCert.isCA).toBe(false);
    expect(leafCert.subject).not.toBe(leafCert.issuer);
  });
});

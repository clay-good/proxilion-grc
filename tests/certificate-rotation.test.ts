/**
 * Certificate Rotation Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CertificateRotationManager,
  CertificateInfo,
  RotationConfig,
} from '../src/certificates/certificate-rotation.js';

// Helper to create test certificates
function createTestCert(overrides: Partial<CertificateInfo> = {}): CertificateInfo {
  const now = new Date();
  return {
    fingerprint: `SHA256:${Math.random().toString(36).substring(2, 34)}`,
    subject: 'CN=test.example.com',
    issuer: 'CN=Proxilion CA',
    validFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    validTo: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    serialNumber: Math.random().toString(16).substring(2, 18),
    ...overrides,
  };
}

describe('CertificateRotationManager', () => {
  let manager: CertificateRotationManager;

  beforeEach(() => {
    manager = new CertificateRotationManager({
      checkIntervalMs: 1000,
      alertThresholdDays: [30, 14, 7],
      renewalThresholdDays: 14,
      enableAutoRotation: false, // Disable auto for controlled testing
    });
  });

  afterEach(() => {
    manager.stop();
  });

  describe('Certificate Registration', () => {
    it('should register a certificate', () => {
      const cert = createTestCert();
      manager.registerCertificate('test-cert', cert);

      const retrieved = manager.getCertificate('test-cert');
      expect(retrieved).toBeDefined();
      expect(retrieved?.fingerprint).toBe(cert.fingerprint);
    });

    it('should unregister a certificate', () => {
      const cert = createTestCert();
      manager.registerCertificate('test-cert', cert);

      const removed = manager.unregisterCertificate('test-cert');
      expect(removed).toBe(true);

      const retrieved = manager.getCertificate('test-cert');
      expect(retrieved).toBeUndefined();
    });

    it('should return false when unregistering non-existent certificate', () => {
      const removed = manager.unregisterCertificate('non-existent');
      expect(removed).toBe(false);
    });

    it('should get all registered certificates', () => {
      const cert1 = createTestCert({ subject: 'CN=cert1.example.com' });
      const cert2 = createTestCert({ subject: 'CN=cert2.example.com' });

      manager.registerCertificate('cert1', cert1);
      manager.registerCertificate('cert2', cert2);

      const all = manager.getAllCertificates();
      expect(all.size).toBe(2);
      expect(all.has('cert1')).toBe(true);
      expect(all.has('cert2')).toBe(true);
    });
  });

  describe('Expiry Calculations', () => {
    it('should calculate days until expiry correctly', () => {
      const cert = createTestCert({
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const days = manager.daysUntilExpiry(cert);
      expect(days).toBeGreaterThanOrEqual(29);
      expect(days).toBeLessThanOrEqual(30);
    });

    it('should detect expired certificates', () => {
      const expiredCert = createTestCert({
        validTo: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      expect(manager.isExpired(expiredCert)).toBe(true);
    });

    it('should detect non-expired certificates', () => {
      const validCert = createTestCert({
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      expect(manager.isExpired(validCert)).toBe(false);
    });

    it('should detect certificates needing rotation', () => {
      const needsRotation = createTestCert({
        validTo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days
      });

      expect(manager.needsRotation(needsRotation)).toBe(true);
    });

    it('should detect certificates not needing rotation', () => {
      const noRotationNeeded = createTestCert({
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });

      expect(manager.needsRotation(noRotationNeeded)).toBe(false);
    });
  });

  describe('Certificate Rotation', () => {
    it('should successfully rotate a certificate', async () => {
      const cert = createTestCert();
      manager.registerCertificate('test-cert', cert);

      const result = await manager.forceRotation('test-cert');

      expect(result.success).toBe(true);
      expect(result.oldCertificate.fingerprint).toBe(cert.fingerprint);
      expect(result.newCertificate).toBeDefined();
      expect(result.newCertificate?.fingerprint).not.toBe(cert.fingerprint);
      expect(result.rollbackAvailable).toBe(true);
    });

    it('should fail rotation for non-existent certificate', async () => {
      const result = await manager.forceRotation('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Certificate not found');
    });

    it('should update certificate after rotation', async () => {
      const cert = createTestCert();
      manager.registerCertificate('test-cert', cert);

      await manager.forceRotation('test-cert');

      const updated = manager.getCertificate('test-cert');
      expect(updated).toBeDefined();
      expect(updated?.fingerprint).not.toBe(cert.fingerprint);
    });

    it('should prevent concurrent rotations', async () => {
      const cert = createTestCert();
      manager.registerCertificate('test-cert', cert);

      // Start rotation directly via trigger (not force)
      const rotationPromise1 = manager.forceRotation('test-cert');

      // Manually trigger again (simulating concurrent call)
      const result = await (manager as any).triggerRotation('test-cert', cert);

      await rotationPromise1;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rotation already in progress');
    });
  });

  describe('Rollback', () => {
    it('should rollback to previous certificate', async () => {
      const cert = createTestCert();
      manager.registerCertificate('test-cert', cert);

      await manager.forceRotation('test-cert');

      const rollbackResult = await manager.rollback('test-cert');

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.newCertificate?.fingerprint).toBe(cert.fingerprint);
    });

    it('should fail rollback when no previous certificate exists', async () => {
      const cert = createTestCert();
      manager.registerCertificate('test-cert', cert);

      // No rotation has occurred, so no previous cert
      const rollbackResult = await manager.rollback('test-cert');

      expect(rollbackResult.success).toBe(false);
      expect(rollbackResult.error).toBe('No previous certificate available for rollback');
    });

    it('should fail rollback for non-existent certificate', async () => {
      const result = await manager.rollback('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Certificate not found');
    });

    it('should support multiple rollbacks', async () => {
      const manager2 = new CertificateRotationManager({
        keepPreviousCertificates: 3,
        enableAutoRotation: false,
      });

      const cert1 = createTestCert();
      manager2.registerCertificate('test-cert', cert1);

      // Rotate multiple times
      await manager2.forceRotation('test-cert');
      await manager2.forceRotation('test-cert');

      // First rollback
      const result1 = await manager2.rollback('test-cert');
      expect(result1.success).toBe(true);
      expect(result1.rollbackAvailable).toBe(true);

      // Second rollback
      const result2 = await manager2.rollback('test-cert');
      expect(result2.success).toBe(true);
      expect(result2.newCertificate?.fingerprint).toBe(cert1.fingerprint);

      manager2.stop();
    });
  });

  describe('Expiring Certificates Query', () => {
    it('should find certificates expiring within timeframe', () => {
      const cert30Days = createTestCert({
        subject: 'CN=30days.example.com',
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      const cert7Days = createTestCert({
        subject: 'CN=7days.example.com',
        validTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const cert60Days = createTestCert({
        subject: 'CN=60days.example.com',
        validTo: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });

      manager.registerCertificate('cert-30', cert30Days);
      manager.registerCertificate('cert-7', cert7Days);
      manager.registerCertificate('cert-60', cert60Days);

      const expiringIn14 = manager.getCertificatesExpiringWithin(14);
      expect(expiringIn14.length).toBe(1);
      expect(expiringIn14[0].id).toBe('cert-7');

      const expiringIn45 = manager.getCertificatesExpiringWithin(45);
      expect(expiringIn45.length).toBe(2);
    });

    it('should sort expiring certificates by days left', () => {
      const cert30Days = createTestCert({
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      const cert7Days = createTestCert({
        validTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const cert15Days = createTestCert({
        validTo: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      });

      manager.registerCertificate('cert-30', cert30Days);
      manager.registerCertificate('cert-7', cert7Days);
      manager.registerCertificate('cert-15', cert15Days);

      const expiring = manager.getCertificatesExpiringWithin(45);

      expect(expiring[0].id).toBe('cert-7');
      expect(expiring[1].id).toBe('cert-15');
      expect(expiring[2].id).toBe('cert-30');
    });

    it('should not include already expired certificates', () => {
      const expiredCert = createTestCert({
        validTo: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      manager.registerCertificate('expired', expiredCert);

      const expiring = manager.getCertificatesExpiringWithin(30);
      expect(expiring.length).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track certificate statistics', async () => {
      const validCert = createTestCert({
        validTo: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });
      const expiringCert = createTestCert({
        validTo: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });
      const expiredCert = createTestCert({
        validTo: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      manager.registerCertificate('valid', validCert);
      manager.registerCertificate('expiring', expiringCert);
      manager.registerCertificate('expired', expiredCert);

      // Perform a rotation
      await manager.forceRotation('valid');

      const stats = manager.getStats();

      expect(stats.totalCertificates).toBe(3);
      expect(stats.expiredCount).toBe(1);
      expect(stats.expiringIn7Days).toBe(1);
      expect(stats.totalRotations).toBe(1);
    });

    it('should track rotation failures', async () => {
      // Create manager that will fail rotations
      const failingManager = new CertificateRotationManager({
        enableAutoRotation: false,
      });

      const cert = createTestCert();
      failingManager.registerCertificate('test', cert);

      // Mock generateNewCertificate to throw
      (failingManager as any).generateNewCertificate = async () => {
        throw new Error('Generation failed');
      };

      const result = await failingManager.forceRotation('test');
      expect(result.success).toBe(false);

      const stats = failingManager.getStats();
      expect(stats.totalFailures).toBe(1);

      failingManager.stop();
    });
  });

  describe('Rotation History', () => {
    it('should track rotation events', async () => {
      const cert = createTestCert();
      manager.registerCertificate('test-cert', cert);

      await manager.forceRotation('test-cert');

      const history = manager.getRotationHistory('test-cert');

      expect(history.length).toBe(2); // started + completed
      expect(history[0].type).toBe('rotation_started');
      expect(history[1].type).toBe('rotation_completed');
    });

    it('should filter history by certificate ID', async () => {
      const cert1 = createTestCert();
      const cert2 = createTestCert();

      manager.registerCertificate('cert1', cert1);
      manager.registerCertificate('cert2', cert2);

      await manager.forceRotation('cert1');
      await manager.forceRotation('cert2');

      const cert1History = manager.getRotationHistory('cert1');
      const cert2History = manager.getRotationHistory('cert2');
      const allHistory = manager.getRotationHistory();

      expect(cert1History.length).toBe(2);
      expect(cert2History.length).toBe(2);
      expect(allHistory.length).toBe(4);
    });
  });

  describe('Event Emission', () => {
    it('should emit rotation_completed event', async () => {
      const cert = createTestCert();
      manager.registerCertificate('test-cert', cert);

      const eventPromise = new Promise<void>((resolve) => {
        manager.on('rotation_completed', (data) => {
          expect(data.id).toBe('test-cert');
          expect(data.oldCert.fingerprint).toBe(cert.fingerprint);
          expect(data.newCert).toBeDefined();
          resolve();
        });
      });

      await manager.forceRotation('test-cert');
      await eventPromise;
    });

    it('should emit rollback_completed event', async () => {
      const cert = createTestCert();
      manager.registerCertificate('test-cert', cert);

      await manager.forceRotation('test-cert');

      const eventPromise = new Promise<void>((resolve) => {
        manager.on('rollback_completed', (data) => {
          expect(data.id).toBe('test-cert');
          expect(data.restoredCert.fingerprint).toBe(cert.fingerprint);
          resolve();
        });
      });

      await manager.rollback('test-cert');
      await eventPromise;
    });
  });

  describe('Auto-Rotation', () => {
    it('should auto-rotate when enabled and certificate is expiring', async () => {
      const autoManager = new CertificateRotationManager({
        checkIntervalMs: 100,
        renewalThresholdDays: 30,
        enableAutoRotation: true,
      });

      const expiringCert = createTestCert({
        validTo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days
      });

      autoManager.registerCertificate('expiring', expiringCert);

      const eventPromise = new Promise<void>((resolve) => {
        autoManager.on('rotation_completed', (data) => {
          expect(data.id).toBe('expiring');
          resolve();
        });
      });

      autoManager.start();

      // Wait for auto-check to trigger rotation
      await eventPromise;

      autoManager.stop();
    });
  });

  describe('Manager Lifecycle', () => {
    it('should start and stop cleanly', () => {
      manager.start();
      expect(() => manager.stop()).not.toThrow();
    });

    it('should handle multiple start/stop cycles', () => {
      manager.start();
      manager.stop();
      manager.start();
      manager.stop();
      // No errors should occur
    });
  });
});

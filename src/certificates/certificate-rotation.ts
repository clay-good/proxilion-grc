/**
 * Certificate Rotation Manager
 *
 * Automated certificate rotation with:
 * - Expiry monitoring and alerts
 * - Automated renewal before expiry
 * - Graceful rotation without connection drops
 * - Rollback capability
 * - Audit logging of all operations
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface CertificateInfo {
  fingerprint: string;
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
}

export interface RotationConfig {
  checkIntervalMs: number; // How often to check certificate expiry
  alertThresholdDays: number[]; // Days before expiry to send alerts (e.g., [30, 14, 7])
  renewalThresholdDays: number; // Days before expiry to trigger renewal
  maxCertificateAge: number; // Maximum certificate validity in days
  enableAutoRotation: boolean; // Enable automatic rotation
  keepPreviousCertificates: number; // Number of previous certificates to keep
}

export interface RotationEvent {
  type: 'expiry_warning' | 'rotation_started' | 'rotation_completed' | 'rotation_failed' | 'rollback';
  certificateId: string;
  timestamp: Date;
  daysUntilExpiry?: number;
  details?: Record<string, unknown>;
}

export interface CertificateRotationResult {
  success: boolean;
  oldCertificate: CertificateInfo;
  newCertificate?: CertificateInfo;
  error?: string;
  rollbackAvailable: boolean;
}

export class CertificateRotationManager extends EventEmitter {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: RotationConfig;
  private certificates: Map<string, CertificateInfo>;
  private previousCertificates: Map<string, CertificateInfo[]>;
  private checkInterval: NodeJS.Timeout | null = null;
  private rotationInProgress: Set<string>;
  private rotationHistory: RotationEvent[];

  constructor(config: Partial<RotationConfig> = {}) {
    super();
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();

    this.config = {
      checkIntervalMs: config.checkIntervalMs || 24 * 60 * 60 * 1000, // Daily
      alertThresholdDays: config.alertThresholdDays || [30, 14, 7, 1],
      renewalThresholdDays: config.renewalThresholdDays || 14,
      maxCertificateAge: config.maxCertificateAge || 365,
      enableAutoRotation: config.enableAutoRotation ?? true,
      keepPreviousCertificates: config.keepPreviousCertificates || 2,
    };

    this.certificates = new Map();
    this.previousCertificates = new Map();
    this.rotationInProgress = new Set();
    this.rotationHistory = [];
  }

  /**
   * Start the rotation manager
   */
  start(): void {
    this.logger.info('Starting certificate rotation manager', {
      config: this.config,
    });

    // Initial check
    this.checkCertificates();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.checkCertificates();
    }, this.config.checkIntervalMs);

    this.metrics.increment('certificate_rotation_manager_started_total');
  }

  /**
   * Stop the rotation manager
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.logger.info('Certificate rotation manager stopped');
    this.metrics.increment('certificate_rotation_manager_stopped_total');
  }

  /**
   * Register a certificate for monitoring
   */
  registerCertificate(id: string, cert: CertificateInfo): void {
    this.certificates.set(id, cert);
    this.logger.info('Certificate registered for monitoring', {
      id,
      subject: cert.subject,
      validTo: cert.validTo.toISOString(),
      daysUntilExpiry: this.daysUntilExpiry(cert),
    });

    this.metrics.increment('certificates_registered_total');
    this.updateExpiryMetric(id, cert);
  }

  /**
   * Unregister a certificate
   */
  unregisterCertificate(id: string): boolean {
    const removed = this.certificates.delete(id);
    if (removed) {
      this.logger.info('Certificate unregistered', { id });
      this.metrics.increment('certificates_unregistered_total');
    }
    return removed;
  }

  /**
   * Get certificate info by ID
   */
  getCertificate(id: string): CertificateInfo | undefined {
    return this.certificates.get(id);
  }

  /**
   * Get all registered certificates
   */
  getAllCertificates(): Map<string, CertificateInfo> {
    return new Map(this.certificates);
  }

  /**
   * Check all certificates for expiry
   */
  checkCertificates(): void {
    const now = new Date();
    this.logger.debug('Checking certificates for expiry', {
      count: this.certificates.size,
    });

    for (const [id, cert] of this.certificates) {
      const daysLeft = this.daysUntilExpiry(cert);
      this.updateExpiryMetric(id, cert);

      // Check for alert thresholds
      for (const threshold of this.config.alertThresholdDays) {
        if (daysLeft <= threshold && daysLeft > threshold - 1) {
          this.emitExpiryWarning(id, cert, daysLeft);
        }
      }

      // Check for auto-rotation
      if (this.config.enableAutoRotation && daysLeft <= this.config.renewalThresholdDays) {
        if (!this.rotationInProgress.has(id)) {
          this.triggerRotation(id, cert);
        }
      }
    }
  }

  /**
   * Calculate days until certificate expiry
   */
  daysUntilExpiry(cert: CertificateInfo): number {
    const now = new Date();
    const diffMs = cert.validTo.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if certificate is expired
   */
  isExpired(cert: CertificateInfo): boolean {
    return new Date() > cert.validTo;
  }

  /**
   * Check if certificate needs rotation
   */
  needsRotation(cert: CertificateInfo): boolean {
    return this.daysUntilExpiry(cert) <= this.config.renewalThresholdDays;
  }

  /**
   * Trigger certificate rotation
   */
  async triggerRotation(id: string, cert: CertificateInfo): Promise<CertificateRotationResult> {
    if (this.rotationInProgress.has(id)) {
      return {
        success: false,
        oldCertificate: cert,
        error: 'Rotation already in progress',
        rollbackAvailable: false,
      };
    }

    this.rotationInProgress.add(id);
    this.logEvent({
      type: 'rotation_started',
      certificateId: id,
      timestamp: new Date(),
      daysUntilExpiry: this.daysUntilExpiry(cert),
    });

    this.logger.info('Starting certificate rotation', {
      id,
      subject: cert.subject,
      daysUntilExpiry: this.daysUntilExpiry(cert),
    });

    try {
      // Generate new certificate (in production, this would call actual certificate generation)
      const newCert = await this.generateNewCertificate(id, cert);

      // Store old certificate for rollback
      this.storePreviousCertificate(id, cert);

      // Update current certificate
      this.certificates.set(id, newCert);

      this.logEvent({
        type: 'rotation_completed',
        certificateId: id,
        timestamp: new Date(),
        details: {
          oldFingerprint: cert.fingerprint,
          newFingerprint: newCert.fingerprint,
        },
      });

      this.logger.info('Certificate rotation completed', {
        id,
        oldFingerprint: cert.fingerprint,
        newFingerprint: newCert.fingerprint,
      });

      this.metrics.increment('certificate_rotations_completed_total');
      this.emit('rotation_completed', { id, oldCert: cert, newCert });

      return {
        success: true,
        oldCertificate: cert,
        newCertificate: newCert,
        rollbackAvailable: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logEvent({
        type: 'rotation_failed',
        certificateId: id,
        timestamp: new Date(),
        details: { error: errorMessage },
      });

      this.logger.error('Certificate rotation failed', new Error(errorMessage), { id });
      this.metrics.increment('certificate_rotations_failed_total');
      this.emit('rotation_failed', { id, cert, error: errorMessage });

      return {
        success: false,
        oldCertificate: cert,
        error: errorMessage,
        rollbackAvailable: this.hasPreviousCertificate(id),
      };
    } finally {
      this.rotationInProgress.delete(id);
    }
  }

  /**
   * Rollback to previous certificate
   */
  async rollback(id: string): Promise<CertificateRotationResult> {
    const currentCert = this.certificates.get(id);
    if (!currentCert) {
      return {
        success: false,
        oldCertificate: {} as CertificateInfo,
        error: 'Certificate not found',
        rollbackAvailable: false,
      };
    }

    const previousCerts = this.previousCertificates.get(id);
    if (!previousCerts || previousCerts.length === 0) {
      return {
        success: false,
        oldCertificate: currentCert,
        error: 'No previous certificate available for rollback',
        rollbackAvailable: false,
      };
    }

    const previousCert = previousCerts[previousCerts.length - 1];

    this.logEvent({
      type: 'rollback',
      certificateId: id,
      timestamp: new Date(),
      details: {
        fromFingerprint: currentCert.fingerprint,
        toFingerprint: previousCert.fingerprint,
      },
    });

    // Restore previous certificate
    this.certificates.set(id, previousCert);
    previousCerts.pop();

    this.logger.info('Certificate rollback completed', {
      id,
      rolledBackTo: previousCert.fingerprint,
    });

    this.metrics.increment('certificate_rollbacks_total');
    this.emit('rollback_completed', { id, restoredCert: previousCert });

    return {
      success: true,
      oldCertificate: currentCert,
      newCertificate: previousCert,
      rollbackAvailable: previousCerts.length > 0,
    };
  }

  /**
   * Force immediate rotation for a certificate
   */
  async forceRotation(id: string): Promise<CertificateRotationResult> {
    const cert = this.certificates.get(id);
    if (!cert) {
      return {
        success: false,
        oldCertificate: {} as CertificateInfo,
        error: 'Certificate not found',
        rollbackAvailable: false,
      };
    }

    this.logger.info('Forcing certificate rotation', { id });
    return this.triggerRotation(id, cert);
  }

  /**
   * Get rotation history
   */
  getRotationHistory(id?: string): RotationEvent[] {
    if (id) {
      return this.rotationHistory.filter((e) => e.certificateId === id);
    }
    return [...this.rotationHistory];
  }

  /**
   * Get certificates expiring within N days
   */
  getCertificatesExpiringWithin(days: number): Array<{ id: string; cert: CertificateInfo; daysLeft: number }> {
    const expiring: Array<{ id: string; cert: CertificateInfo; daysLeft: number }> = [];

    for (const [id, cert] of this.certificates) {
      const daysLeft = this.daysUntilExpiry(cert);
      if (daysLeft <= days && daysLeft >= 0) {
        expiring.push({ id, cert, daysLeft });
      }
    }

    return expiring.sort((a, b) => a.daysLeft - b.daysLeft);
  }

  /**
   * Get rotation statistics
   */
  getStats(): {
    totalCertificates: number;
    expiredCount: number;
    expiringIn7Days: number;
    expiringIn30Days: number;
    rotationsInProgress: number;
    totalRotations: number;
    totalRollbacks: number;
    totalFailures: number;
  } {
    const rotations = this.rotationHistory.filter((e) => e.type === 'rotation_completed').length;
    const rollbacks = this.rotationHistory.filter((e) => e.type === 'rollback').length;
    const failures = this.rotationHistory.filter((e) => e.type === 'rotation_failed').length;

    let expired = 0;
    let expiringIn7 = 0;
    let expiringIn30 = 0;

    for (const cert of this.certificates.values()) {
      const daysLeft = this.daysUntilExpiry(cert);
      if (daysLeft < 0) expired++;
      else if (daysLeft <= 7) expiringIn7++;
      else if (daysLeft <= 30) expiringIn30++;
    }

    return {
      totalCertificates: this.certificates.size,
      expiredCount: expired,
      expiringIn7Days: expiringIn7,
      expiringIn30Days: expiringIn30,
      rotationsInProgress: this.rotationInProgress.size,
      totalRotations: rotations,
      totalRollbacks: rollbacks,
      totalFailures: failures,
    };
  }

  // Private helper methods

  private async generateNewCertificate(id: string, oldCert: CertificateInfo): Promise<CertificateInfo> {
    // In production, this would call the actual certificate generation logic
    // For now, generate a simulated new certificate
    const now = new Date();
    const validTo = new Date(now.getTime() + this.config.maxCertificateAge * 24 * 60 * 60 * 1000);

    return {
      fingerprint: `SHA256:${this.generateRandomHex(64)}`,
      subject: oldCert.subject,
      issuer: oldCert.issuer,
      validFrom: now,
      validTo,
      serialNumber: this.generateRandomHex(16),
    };
  }

  private generateRandomHex(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  private storePreviousCertificate(id: string, cert: CertificateInfo): void {
    let previous = this.previousCertificates.get(id);
    if (!previous) {
      previous = [];
      this.previousCertificates.set(id, previous);
    }

    previous.push(cert);

    // Keep only configured number of previous certificates
    while (previous.length > this.config.keepPreviousCertificates) {
      previous.shift();
    }
  }

  private hasPreviousCertificate(id: string): boolean {
    const previous = this.previousCertificates.get(id);
    return previous !== undefined && previous.length > 0;
  }

  private emitExpiryWarning(id: string, cert: CertificateInfo, daysLeft: number): void {
    this.logEvent({
      type: 'expiry_warning',
      certificateId: id,
      timestamp: new Date(),
      daysUntilExpiry: daysLeft,
    });

    this.logger.warn('Certificate expiry warning', {
      id,
      subject: cert.subject,
      daysUntilExpiry: daysLeft,
      validTo: cert.validTo.toISOString(),
    });

    this.metrics.increment('certificate_expiry_warnings_total');
    this.emit('expiry_warning', { id, cert, daysUntilExpiry: daysLeft });
  }

  private updateExpiryMetric(id: string, cert: CertificateInfo): void {
    const daysLeft = this.daysUntilExpiry(cert);
    this.metrics.gauge('certificate_days_until_expiry', daysLeft, { id });
  }

  private logEvent(event: RotationEvent): void {
    this.rotationHistory.push(event);

    // Keep history manageable
    if (this.rotationHistory.length > 1000) {
      this.rotationHistory = this.rotationHistory.slice(-500);
    }
  }
}

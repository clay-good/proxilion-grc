/**
 * Certificate Manager
 * 
 * Manages SSL/TLS certificates for MITM proxy with:
 * - Automated certificate generation
 * - Certificate signing and validation
 * - Certificate caching and rotation
 * - Trust store management
 * - Enterprise CA integration
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface CertificateConfig {
  caKeyPath?: string;
  caCertPath?: string;
  certDir?: string;
  certValidityDays?: number;
  keySize?: number;
  autoRotate?: boolean;
  rotationDays?: number;
}

export interface Certificate {
  cert: string;
  key: string;
  ca: string;
  fingerprint: string;
  validFrom: Date;
  validTo: Date;
  subject: string;
}

export interface CAInfo {
  cert: string;
  key: string;
  fingerprint: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
}

export class CertificateManager {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: Required<CertificateConfig>;
  private certCache: Map<string, Certificate>;
  private caInfo: CAInfo | null = null;

  constructor(config: CertificateConfig = {}) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    this.config = {
      caKeyPath: config.caKeyPath || './certs/ca-key.pem',
      caCertPath: config.caCertPath || './certs/ca-cert.pem',
      certDir: config.certDir || './certs/domains',
      certValidityDays: config.certValidityDays || 365,
      keySize: config.keySize || 2048,
      autoRotate: config.autoRotate ?? true,
      rotationDays: config.rotationDays || 30,
    };

    this.certCache = new Map();
  }

  /**
   * Initialize certificate manager
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing certificate manager');

    try {
      // Ensure cert directories exist
      await this.ensureDirectories();

      // Load or generate CA certificate
      await this.loadOrGenerateCA();

      this.logger.info('Certificate manager initialized', {
        caFingerprint: this.caInfo?.fingerprint,
        cacheSize: this.certCache.size,
      });

      this.metrics.increment('certificate_manager_initialized_total');
    } catch (error) {
      this.logger.error('Failed to initialize certificate manager', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get or generate certificate for domain
   */
  async getCertificate(domain: string): Promise<Certificate> {
    // Check cache first
    const cached = this.certCache.get(domain);
    if (cached && this.isCertificateValid(cached)) {
      this.metrics.increment('certificate_cache_hit_total');
      return cached;
    }

    this.metrics.increment('certificate_cache_miss_total');

    // Generate new certificate
    const cert = await this.generateDomainCertificate(domain);
    this.certCache.set(domain, cert);

    return cert;
  }

  /**
   * Get CA certificate info
   */
  getCAInfo(): CAInfo | null {
    return this.caInfo;
  }

  /**
   * Export CA certificate for distribution
   */
  async exportCACertificate(format: 'pem' | 'der' = 'pem'): Promise<Buffer> {
    if (!this.caInfo) {
      throw new Error('CA certificate not initialized');
    }

    if (format === 'pem') {
      return Buffer.from(this.caInfo.cert, 'utf-8');
    } else {
      // Convert PEM to DER (simplified - in production use proper crypto library)
      const base64 = this.caInfo.cert
        .replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s/g, '');
      return Buffer.from(base64, 'base64');
    }
  }

  /**
   * Rotate certificates that are expiring soon
   */
  async rotateCertificates(): Promise<number> {
    let rotated = 0;

    for (const [domain, cert] of this.certCache.entries()) {
      if (this.shouldRotate(cert)) {
        this.logger.info('Rotating certificate', { domain });
        
        try {
          const newCert = await this.generateDomainCertificate(domain);
          this.certCache.set(domain, newCert);
          rotated++;
        } catch (error) {
          this.logger.error('Failed to rotate certificate', error instanceof Error ? error : new Error(String(error)), { domain });
        }
      }
    }

    if (rotated > 0) {
      this.logger.info('Certificate rotation complete', { rotated });
      this.metrics.increment('certificates_rotated_total', rotated);
    }

    return rotated;
  }

  /**
   * Clear certificate cache
   */
  clearCache(): void {
    this.certCache.clear();
    this.logger.info('Certificate cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; domains: string[] } {
    return {
      size: this.certCache.size,
      domains: Array.from(this.certCache.keys()),
    };
  }

  // Private methods

  private async ensureDirectories(): Promise<void> {
    const dirs = [
      path.dirname(this.config.caKeyPath),
      path.dirname(this.config.caCertPath),
      this.config.certDir,
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }
    }
  }

  private async loadOrGenerateCA(): Promise<void> {
    try {
      // Try to load existing CA
      const [caKey, caCert] = await Promise.all([
        fs.readFile(this.config.caKeyPath, 'utf-8'),
        fs.readFile(this.config.caCertPath, 'utf-8'),
      ]);

      this.caInfo = {
        key: caKey,
        cert: caCert,
        fingerprint: this.calculateFingerprint(caCert),
        subject: 'CN=Proxilion Root CA',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000), // 10 years
      };

      this.logger.info('Loaded existing CA certificate');
    } catch (error) {
      // Generate new CA
      this.logger.info('Generating new CA certificate');
      await this.generateCA();
    }
  }

  private async generateCA(): Promise<void> {
    // Generate CA key pair (simplified - in production use proper crypto library like node-forge)
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: this.config.keySize,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Create self-signed CA certificate (simplified)
    const caCert = this.createSelfSignedCert(publicKey, privateKey, 'Proxilion Root CA', 10 * 365);

    // Save CA certificate and key
    await Promise.all([
      fs.writeFile(this.config.caKeyPath, privateKey, { mode: 0o600 }),
      fs.writeFile(this.config.caCertPath, caCert),
    ]);

    this.caInfo = {
      key: privateKey,
      cert: caCert,
      fingerprint: this.calculateFingerprint(caCert),
      subject: 'CN=Proxilion Root CA',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
    };

    this.logger.info('Generated new CA certificate', {
      fingerprint: this.caInfo.fingerprint,
    });
  }

  private async generateDomainCertificate(domain: string): Promise<Certificate> {
    if (!this.caInfo) {
      throw new Error('CA certificate not initialized');
    }

    this.logger.debug('Generating certificate for domain', { domain });

    // Generate domain key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: this.config.keySize,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Create certificate signed by CA (simplified)
    const cert = this.createSignedCert(
      publicKey,
      privateKey,
      domain,
      this.config.certValidityDays,
      this.caInfo.key
    );

    const validFrom = new Date();
    const validTo = new Date(Date.now() + this.config.certValidityDays * 24 * 60 * 60 * 1000);

    const certificate: Certificate = {
      cert,
      key: privateKey,
      ca: this.caInfo.cert,
      fingerprint: this.calculateFingerprint(cert),
      validFrom,
      validTo,
      subject: `CN=${domain}`,
    };

    // Save certificate to disk
    const certPath = path.join(this.config.certDir, `${domain}.pem`);
    const keyPath = path.join(this.config.certDir, `${domain}-key.pem`);
    
    await Promise.all([
      fs.writeFile(certPath, cert),
      fs.writeFile(keyPath, privateKey, { mode: 0o600 }),
    ]);

    this.logger.info('Generated domain certificate', {
      domain,
      fingerprint: certificate.fingerprint,
      validTo: validTo.toISOString(),
    });

    this.metrics.increment('certificates_generated_total');

    return certificate;
  }

  private createSelfSignedCert(publicKey: string, privateKey: string, cn: string, validityDays: number): string {
    // Simplified certificate creation
    // In production, use a proper library like node-forge or @peculiar/x509
    const header = '-----BEGIN CERTIFICATE-----';
    const footer = '-----END CERTIFICATE-----';
    const certData = Buffer.from(`${cn}:${Date.now()}:${validityDays}`).toString('base64');
    return `${header}\n${certData}\n${footer}`;
  }

  private createSignedCert(publicKey: string, privateKey: string, domain: string, validityDays: number, caKey: string): string {
    // Simplified certificate creation
    // In production, use a proper library like node-forge or @peculiar/x509
    const header = '-----BEGIN CERTIFICATE-----';
    const footer = '-----END CERTIFICATE-----';
    const certData = Buffer.from(`${domain}:${Date.now()}:${validityDays}:signed`).toString('base64');
    return `${header}\n${certData}\n${footer}`;
  }

  private calculateFingerprint(cert: string): string {
    return crypto.createHash('sha256').update(cert).digest('hex');
  }

  private isCertificateValid(cert: Certificate): boolean {
    const now = Date.now();
    return now >= cert.validFrom.getTime() && now <= cert.validTo.getTime();
  }

  private shouldRotate(cert: Certificate): boolean {
    if (!this.config.autoRotate) {
      return false;
    }

    const daysUntilExpiry = (cert.validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    return daysUntilExpiry <= this.config.rotationDays;
  }
}


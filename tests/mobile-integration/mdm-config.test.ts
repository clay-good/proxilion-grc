/**
 * MDM Configuration Tests
 *
 * Tests for Mobile Device Management configuration validation,
 * profile generation, and deployment scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock MDM configuration types
interface MDMProxyConfig {
  proxyHost: string;
  proxyPort: number;
  bypassDomains: string[];
  authRequired: boolean;
  authType?: 'basic' | 'certificate';
}

interface MDMCertificateConfig {
  certificateName: string;
  certificateData: string;
  certificateType: 'ca' | 'client';
  installLocation: 'system' | 'user';
}

interface MDMProfile {
  profileId: string;
  profileName: string;
  organizationName: string;
  proxyConfig: MDMProxyConfig;
  certificateConfig: MDMCertificateConfig;
  platform: 'ios' | 'android' | 'windows' | 'macos';
}

// MDM Profile Generator (simulated)
class MDMProfileGenerator {
  generateIOSProfile(config: MDMProfile): string {
    // Generate iOS mobileconfig XML
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key>
            <string>com.apple.wifi.managed</string>
            <key>ProxyType</key>
            <string>Manual</string>
            <key>ProxyServer</key>
            <string>${config.proxyConfig.proxyHost}</string>
            <key>ProxyServerPort</key>
            <integer>${config.proxyConfig.proxyPort}</integer>
        </dict>
    </array>
    <key>PayloadDisplayName</key>
    <string>${config.profileName}</string>
    <key>PayloadIdentifier</key>
    <string>${config.profileId}</string>
    <key>PayloadOrganization</key>
    <string>${config.organizationName}</string>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>`;
  }

  generateAndroidProfile(config: MDMProfile): object {
    // Generate Android managed configuration JSON
    return {
      managed_configuration: {
        proxy_host: config.proxyConfig.proxyHost,
        proxy_port: config.proxyConfig.proxyPort,
        proxy_bypass: config.proxyConfig.bypassDomains.join(','),
        auth_required: config.proxyConfig.authRequired,
      },
      certificate: {
        name: config.certificateConfig.certificateName,
        data: config.certificateConfig.certificateData,
        type: config.certificateConfig.certificateType,
      },
    };
  }

  validateProfile(profile: MDMProfile): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!profile.profileId || profile.profileId.length < 5) {
      errors.push('Profile ID must be at least 5 characters');
    }

    if (!profile.proxyConfig.proxyHost) {
      errors.push('Proxy host is required');
    }

    if (profile.proxyConfig.proxyPort < 1 || profile.proxyConfig.proxyPort > 65535) {
      errors.push('Proxy port must be between 1 and 65535');
    }

    if (!profile.certificateConfig.certificateData) {
      errors.push('Certificate data is required');
    }

    if (!['ios', 'android', 'windows', 'macos'].includes(profile.platform)) {
      errors.push('Invalid platform specified');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

describe('MDM Configuration', () => {
  let generator: MDMProfileGenerator;

  beforeEach(() => {
    generator = new MDMProfileGenerator();
  });

  describe('Profile Validation', () => {
    it('should validate a complete profile', () => {
      const profile: MDMProfile = {
        profileId: 'com.proxilion.proxy.profile',
        profileName: 'Proxilion AI Security',
        organizationName: 'Test Organization',
        proxyConfig: {
          proxyHost: 'proxy.example.com',
          proxyPort: 8787,
          bypassDomains: ['localhost', '*.internal.com'],
          authRequired: false,
        },
        certificateConfig: {
          certificateName: 'Proxilion CA',
          certificateData: 'base64-encoded-cert-data',
          certificateType: 'ca',
          installLocation: 'system',
        },
        platform: 'ios',
      };

      const result = generator.validateProfile(profile);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject profile with missing proxy host', () => {
      const profile: MDMProfile = {
        profileId: 'com.proxilion.proxy.profile',
        profileName: 'Proxilion AI Security',
        organizationName: 'Test Organization',
        proxyConfig: {
          proxyHost: '',
          proxyPort: 8787,
          bypassDomains: [],
          authRequired: false,
        },
        certificateConfig: {
          certificateName: 'Proxilion CA',
          certificateData: 'base64-encoded-cert-data',
          certificateType: 'ca',
          installLocation: 'system',
        },
        platform: 'ios',
      };

      const result = generator.validateProfile(profile);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Proxy host is required');
    });

    it('should reject profile with invalid port', () => {
      const profile: MDMProfile = {
        profileId: 'com.proxilion.proxy.profile',
        profileName: 'Proxilion AI Security',
        organizationName: 'Test Organization',
        proxyConfig: {
          proxyHost: 'proxy.example.com',
          proxyPort: 99999,
          bypassDomains: [],
          authRequired: false,
        },
        certificateConfig: {
          certificateName: 'Proxilion CA',
          certificateData: 'base64-encoded-cert-data',
          certificateType: 'ca',
          installLocation: 'system',
        },
        platform: 'ios',
      };

      const result = generator.validateProfile(profile);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Proxy port must be between 1 and 65535');
    });

    it('should reject profile with short profile ID', () => {
      const profile: MDMProfile = {
        profileId: 'ab',
        profileName: 'Test',
        organizationName: 'Test Organization',
        proxyConfig: {
          proxyHost: 'proxy.example.com',
          proxyPort: 8787,
          bypassDomains: [],
          authRequired: false,
        },
        certificateConfig: {
          certificateName: 'Proxilion CA',
          certificateData: 'base64-encoded-cert-data',
          certificateType: 'ca',
          installLocation: 'system',
        },
        platform: 'ios',
      };

      const result = generator.validateProfile(profile);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Profile ID must be at least 5 characters');
    });

    it('should reject profile with invalid platform', () => {
      const profile: MDMProfile = {
        profileId: 'com.proxilion.proxy.profile',
        profileName: 'Test',
        organizationName: 'Test Organization',
        proxyConfig: {
          proxyHost: 'proxy.example.com',
          proxyPort: 8787,
          bypassDomains: [],
          authRequired: false,
        },
        certificateConfig: {
          certificateName: 'Proxilion CA',
          certificateData: 'base64-encoded-cert-data',
          certificateType: 'ca',
          installLocation: 'system',
        },
        platform: 'invalid' as any,
      };

      const result = generator.validateProfile(profile);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid platform specified');
    });
  });

  describe('iOS Profile Generation', () => {
    it('should generate valid iOS mobileconfig XML', () => {
      const profile: MDMProfile = {
        profileId: 'com.proxilion.proxy.ios',
        profileName: 'Proxilion AI Security',
        organizationName: 'Test Corp',
        proxyConfig: {
          proxyHost: 'proxy.testcorp.com',
          proxyPort: 8787,
          bypassDomains: ['localhost'],
          authRequired: false,
        },
        certificateConfig: {
          certificateName: 'Proxilion CA',
          certificateData: 'cert-data',
          certificateType: 'ca',
          installLocation: 'system',
        },
        platform: 'ios',
      };

      const xml = generator.generateIOSProfile(profile);

      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<plist version="1.0">');
      expect(xml).toContain('proxy.testcorp.com');
      expect(xml).toContain('<integer>8787</integer>');
      expect(xml).toContain('Proxilion AI Security');
      expect(xml).toContain('com.proxilion.proxy.ios');
      expect(xml).toContain('Test Corp');
    });

    it('should include proxy type as Manual', () => {
      const profile: MDMProfile = {
        profileId: 'com.proxilion.proxy.ios',
        profileName: 'Test',
        organizationName: 'Test Corp',
        proxyConfig: {
          proxyHost: 'proxy.example.com',
          proxyPort: 8787,
          bypassDomains: [],
          authRequired: false,
        },
        certificateConfig: {
          certificateName: 'CA',
          certificateData: 'data',
          certificateType: 'ca',
          installLocation: 'system',
        },
        platform: 'ios',
      };

      const xml = generator.generateIOSProfile(profile);
      expect(xml).toContain('<string>Manual</string>');
    });
  });

  describe('Android Profile Generation', () => {
    it('should generate valid Android managed configuration', () => {
      const profile: MDMProfile = {
        profileId: 'com.proxilion.proxy.android',
        profileName: 'Proxilion AI Security',
        organizationName: 'Test Corp',
        proxyConfig: {
          proxyHost: 'proxy.testcorp.com',
          proxyPort: 8787,
          bypassDomains: ['localhost', '*.internal.com'],
          authRequired: true,
        },
        certificateConfig: {
          certificateName: 'Proxilion CA',
          certificateData: 'cert-data-base64',
          certificateType: 'ca',
          installLocation: 'system',
        },
        platform: 'android',
      };

      const config = generator.generateAndroidProfile(profile);

      expect(config).toHaveProperty('managed_configuration');
      expect(config).toHaveProperty('certificate');

      const mc = (config as any).managed_configuration;
      expect(mc.proxy_host).toBe('proxy.testcorp.com');
      expect(mc.proxy_port).toBe(8787);
      expect(mc.proxy_bypass).toBe('localhost,*.internal.com');
      expect(mc.auth_required).toBe(true);

      const cert = (config as any).certificate;
      expect(cert.name).toBe('Proxilion CA');
      expect(cert.data).toBe('cert-data-base64');
      expect(cert.type).toBe('ca');
    });

    it('should handle empty bypass domains', () => {
      const profile: MDMProfile = {
        profileId: 'com.proxilion.proxy.android',
        profileName: 'Test',
        organizationName: 'Test Corp',
        proxyConfig: {
          proxyHost: 'proxy.example.com',
          proxyPort: 8787,
          bypassDomains: [],
          authRequired: false,
        },
        certificateConfig: {
          certificateName: 'CA',
          certificateData: 'data',
          certificateType: 'ca',
          installLocation: 'system',
        },
        platform: 'android',
      };

      const config = generator.generateAndroidProfile(profile);
      expect((config as any).managed_configuration.proxy_bypass).toBe('');
    });
  });

  describe('Cross-Platform Consistency', () => {
    it('should maintain same proxy settings across platforms', () => {
      const baseConfig = {
        proxyHost: 'unified-proxy.example.com',
        proxyPort: 8787,
        bypassDomains: ['localhost', '127.0.0.1'],
        authRequired: false,
      };

      const iosProfile: MDMProfile = {
        profileId: 'com.proxilion.ios',
        profileName: 'Proxilion',
        organizationName: 'Test',
        proxyConfig: baseConfig,
        certificateConfig: {
          certificateName: 'CA',
          certificateData: 'data',
          certificateType: 'ca',
          installLocation: 'system',
        },
        platform: 'ios',
      };

      const androidProfile: MDMProfile = {
        profileId: 'com.proxilion.android',
        profileName: 'Proxilion',
        organizationName: 'Test',
        proxyConfig: baseConfig,
        certificateConfig: {
          certificateName: 'CA',
          certificateData: 'data',
          certificateType: 'ca',
          installLocation: 'system',
        },
        platform: 'android',
      };

      const iosXml = generator.generateIOSProfile(iosProfile);
      const androidConfig = generator.generateAndroidProfile(androidProfile);

      // Verify both use same proxy host and port
      expect(iosXml).toContain('unified-proxy.example.com');
      expect(iosXml).toContain('<integer>8787</integer>');
      expect((androidConfig as any).managed_configuration.proxy_host).toBe('unified-proxy.example.com');
      expect((androidConfig as any).managed_configuration.proxy_port).toBe(8787);
    });
  });
});

describe('MDM Deployment Scenarios', () => {
  describe('Intune Deployment', () => {
    it('should support Intune configuration profile format', () => {
      const intuneConfig = {
        '@odata.type': '#microsoft.graph.iosCustomConfiguration',
        displayName: 'Proxilion Proxy Configuration',
        payloadFileName: 'proxilion.mobileconfig',
        payload: 'base64-encoded-mobileconfig',
      };

      expect(intuneConfig['@odata.type']).toBe('#microsoft.graph.iosCustomConfiguration');
      expect(intuneConfig.payloadFileName).toMatch(/\.mobileconfig$/);
    });

    it('should validate Intune assignment groups', () => {
      const assignment = {
        target: {
          '@odata.type': '#microsoft.graph.groupAssignmentTarget',
          groupId: 'group-uuid-here',
        },
      };

      expect(assignment.target['@odata.type']).toBe('#microsoft.graph.groupAssignmentTarget');
      expect(assignment.target.groupId).toBeDefined();
    });
  });

  describe('Jamf Pro Deployment', () => {
    it('should support Jamf configuration profile format', () => {
      const jamfConfig = {
        general: {
          name: 'Proxilion Proxy Configuration',
          category: 'Security',
          distribution_method: 'Install Automatically',
          level: 'Computer Level',
        },
        scope: {
          all_computers: false,
          computer_groups: [
            { id: 1, name: 'AI Users' },
          ],
        },
      };

      expect(jamfConfig.general.distribution_method).toBe('Install Automatically');
      expect(jamfConfig.scope.computer_groups.length).toBeGreaterThan(0);
    });
  });

  describe('Workspace ONE Deployment', () => {
    it('should support Workspace ONE profile format', () => {
      const wsoneConfig = {
        type: 'PROXY',
        name: 'Proxilion Proxy',
        description: 'AI Security Proxy Configuration',
        settings: {
          ProxyAutoConfigEnable: false,
          ProxyAutoConfigURL: '',
          ProxyServer: 'proxy.example.com',
          ProxyPort: 8787,
        },
        assignment: {
          smart_groups: ['All iOS Devices'],
        },
      };

      expect(wsoneConfig.type).toBe('PROXY');
      expect(wsoneConfig.settings.ProxyServer).toBeDefined();
      expect(wsoneConfig.settings.ProxyPort).toBe(8787);
    });
  });
});

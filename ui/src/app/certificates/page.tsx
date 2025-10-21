'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  Download,
  Copy,
  CheckCircle,
  AlertTriangle,
  FileText,
  Terminal,
  Chrome,
  Apple,
  Monitor,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/api';

interface CAInfo {
  fingerprint: string;
  subject: string;
  validFrom: string;
  validTo: string;
}

async function fetchCAInfo() {
  const res = await fetch(`${API_URL}/certificates/ca`);
  if (!res.ok) throw new Error('Failed to fetch CA info');
  return res.json();
}

export default function CertificatesPage() {
  const [copied, setCopied] = useState(false);

  const { data: caInfo, isLoading } = useQuery<CAInfo>({
    queryKey: ['ca-info'],
    queryFn: fetchCAInfo,
  });

  const handleDownload = async (format: 'pem' | 'der') => {
    try {
      const res = await fetch(`${API_URL}/certificates/ca/download?format=${format}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proxilion-ca.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const copyFingerprint = () => {
    if (caInfo?.fingerprint) {
      navigator.clipboard.writeText(caInfo.fingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-3">
            <Shield className="h-8 w-8 text-primary-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Certificate Management</h1>
              <p className="text-sm text-gray-500">Install and manage SSL/TLS certificates</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* CA Certificate Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Root CA Certificate</h2>
            <p className="text-sm text-gray-600 mt-1">
              Install this certificate to enable HTTPS interception
            </p>
          </div>

          {isLoading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading certificate info...</p>
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                  <div className="px-4 py-3 bg-gray-50 rounded-lg font-mono text-sm">
                    {caInfo?.subject}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fingerprint (SHA-256)
                  </label>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 px-4 py-3 bg-gray-50 rounded-lg font-mono text-xs break-all">
                      {caInfo?.fingerprint}
                    </div>
                    <button
                      onClick={copyFingerprint}
                      className="p-3 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                    >
                      {copied ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <Copy className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Valid From</label>
                  <div className="px-4 py-3 bg-gray-50 rounded-lg text-sm">
                    {caInfo?.validFrom && new Date(caInfo.validFrom).toLocaleString()}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Valid To</label>
                  <div className="px-4 py-3 bg-gray-50 rounded-lg text-sm">
                    {caInfo?.validTo && new Date(caInfo.validTo).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  onClick={() => handleDownload('pem')}
                  className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  <Download className="h-4 w-4" />
                  <span>Download PEM</span>
                </button>
                <button
                  onClick={() => handleDownload('der')}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  <Download className="h-4 w-4" />
                  <span>Download DER</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Installation Instructions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* macOS */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <Apple className="h-6 w-6 text-gray-700" />
                <h3 className="text-lg font-semibold text-gray-900">macOS Installation</h3>
              </div>
            </div>
            <div className="p-6">
              <ol className="space-y-4 text-sm text-gray-700">
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    1
                  </span>
                  <span>Download the certificate in PEM format</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    2
                  </span>
                  <span>Double-click the downloaded certificate file</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    3
                  </span>
                  <span>In Keychain Access, select "System" keychain</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    4
                  </span>
                  <span>Double-click the certificate and set "Always Trust"</span>
                </li>
              </ol>
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <Terminal className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900 mb-2">Command Line:</p>
                    <code className="text-xs text-blue-800 bg-blue-100 px-2 py-1 rounded block">
                      sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain proxilion-ca.pem
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Windows */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <Monitor className="h-6 w-6 text-gray-700" />
                <h3 className="text-lg font-semibold text-gray-900">Windows Installation</h3>
              </div>
            </div>
            <div className="p-6">
              <ol className="space-y-4 text-sm text-gray-700">
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    1
                  </span>
                  <span>Download the certificate in DER format</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    2
                  </span>
                  <span>Right-click the certificate and select "Install Certificate"</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    3
                  </span>
                  <span>Select "Local Machine" and click Next</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    4
                  </span>
                  <span>Choose "Trusted Root Certification Authorities"</span>
                </li>
              </ol>
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <Terminal className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900 mb-2">PowerShell:</p>
                    <code className="text-xs text-blue-800 bg-blue-100 px-2 py-1 rounded block">
                      Import-Certificate -FilePath proxilion-ca.der -CertStoreLocation Cert:\LocalMachine\Root
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chrome/Edge */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <Chrome className="h-6 w-6 text-gray-700" />
                <h3 className="text-lg font-semibold text-gray-900">Chrome/Edge</h3>
              </div>
            </div>
            <div className="p-6">
              <ol className="space-y-4 text-sm text-gray-700">
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    1
                  </span>
                  <span>Go to Settings → Privacy and security → Security</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    2
                  </span>
                  <span>Click "Manage certificates"</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    3
                  </span>
                  <span>Go to "Trusted Root Certification Authorities" tab</span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    4
                  </span>
                  <span>Click "Import" and select the downloaded certificate</span>
                </li>
              </ol>
            </div>
          </div>

          {/* Linux */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <Terminal className="h-6 w-6 text-gray-700" />
                <h3 className="text-lg font-semibold text-gray-900">Linux Installation</h3>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Ubuntu/Debian:</p>
                  <code className="text-xs text-gray-800 bg-gray-100 px-3 py-2 rounded block">
                    sudo cp proxilion-ca.pem /usr/local/share/ca-certificates/proxilion-ca.crt<br />
                    sudo update-ca-certificates
                  </code>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">RHEL/CentOS:</p>
                  <code className="text-xs text-gray-800 bg-gray-100 px-3 py-2 rounded block">
                    sudo cp proxilion-ca.pem /etc/pki/ca-trust/source/anchors/<br />
                    sudo update-ca-trust
                  </code>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-6 w-6 text-yellow-600 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-yellow-900 mb-2">Important Security Notice</h3>
              <p className="text-sm text-yellow-800">
                Installing this certificate allows Proxilion to intercept and inspect HTTPS traffic.
                Only install this certificate on devices within your organization's network and ensure
                proper security controls are in place.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


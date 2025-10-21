'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  Search,
  Filter,
  Save,
  RefreshCw,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/api';

interface PIIPattern {
  name: string;
  category: string;
  severity: string;
  enabled: boolean;
  complianceStandards: string[];
  description?: string;
}

interface ComplianceRule {
  id: string;
  standard: string;
  name: string;
  description: string;
  severity: string;
  enabled: boolean;
}

async function fetchPIIPatterns() {
  const res = await fetch(`${API_URL}/security/pii-patterns`);
  if (!res.ok) throw new Error('Failed to fetch PII patterns');
  return res.json();
}

async function fetchComplianceRules() {
  const res = await fetch(`${API_URL}/security/compliance-rules`);
  if (!res.ok) throw new Error('Failed to fetch compliance rules');
  return res.json();
}

async function updatePatternStatus(patternName: string, enabled: boolean) {
  const res = await fetch(`${API_URL}/security/pii-patterns/${encodeURIComponent(patternName)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error('Failed to update pattern');
  return res.json();
}

async function updateComplianceRule(ruleId: string, enabled: boolean) {
  const res = await fetch(`${API_URL}/security/compliance-rules/${ruleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error('Failed to update rule');
  return res.json();
}

export default function SecurityPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'pii' | 'compliance'>('pii');

  const { data: piiPatterns, isLoading: piiLoading } = useQuery({
    queryKey: ['pii-patterns'],
    queryFn: fetchPIIPatterns,
  });

  const { data: complianceRules, isLoading: complianceLoading } = useQuery({
    queryKey: ['compliance-rules'],
    queryFn: fetchComplianceRules,
  });

  const patternMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      updatePatternStatus(name, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pii-patterns'] });
    },
  });

  const ruleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateComplianceRule(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-rules'] });
    },
  });

  const filteredPatterns = piiPatterns?.filter((pattern: PIIPattern) => {
    const matchesSearch = pattern.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pattern.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || pattern.category === categoryFilter;
    const matchesSeverity = severityFilter === 'all' || pattern.severity === severityFilter;
    return matchesSearch && matchesCategory && matchesSeverity;
  });

  const filteredRules = complianceRules?.filter((rule: ComplianceRule) => {
    const matchesSearch = rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = severityFilter === 'all' || rule.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-primary-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Security Controls</h1>
                <p className="text-sm text-gray-500">Configure detection patterns and compliance rules</p>
              </div>
            </div>
            <button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['pii-patterns'] });
                queryClient.invalidateQueries({ queryKey: ['compliance-rules'] });
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('pii')}
              className={`flex-1 px-6 py-4 text-sm font-medium ${
                activeTab === 'pii'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              PII Detection Patterns
            </button>
            <button
              onClick={() => setActiveTab('compliance')}
              className={`flex-1 px-6 py-4 text-sm font-medium ${
                activeTab === 'compliance'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Compliance Rules
            </button>
          </div>

          {/* Filters */}
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search patterns..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              {activeTab === 'pii' && (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="all">All Categories</option>
                  <option value="financial">Financial</option>
                  <option value="identity">Identity</option>
                  <option value="contact">Contact</option>
                  <option value="health">Health</option>
                  <option value="government">Government</option>
                  <option value="biometric">Biometric</option>
                </select>
              )}

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {activeTab === 'pii' && (
              <div className="space-y-4">
                {piiLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading patterns...</p>
                  </div>
                ) : filteredPatterns?.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No patterns found matching your filters</p>
                  </div>
                ) : (
                  filteredPatterns?.map((pattern: PIIPattern) => (
                    <div
                      key={pattern.name}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">{pattern.name}</h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded ${getSeverityColor(pattern.severity)}`}>
                            {pattern.severity}
                          </span>
                          <span className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded">
                            {pattern.category}
                          </span>
                        </div>
                        {pattern.description && (
                          <p className="text-sm text-gray-600 mb-2">{pattern.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {pattern.complianceStandards.map((standard) => (
                            <span
                              key={standard}
                              className="px-2 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded"
                            >
                              {standard}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => patternMutation.mutate({ name: pattern.name, enabled: !pattern.enabled })}
                        disabled={patternMutation.isPending}
                        className={`ml-4 px-4 py-2 rounded-lg font-medium transition-colors ${
                          pattern.enabled
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {pattern.enabled ? (
                          <span className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4" />
                            <span>Enabled</span>
                          </span>
                        ) : (
                          <span className="flex items-center space-x-2">
                            <XCircle className="h-4 w-4" />
                            <span>Disabled</span>
                          </span>
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'compliance' && (
              <div className="space-y-4">
                {complianceLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading rules...</p>
                  </div>
                ) : filteredRules?.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No rules found matching your filters</p>
                  </div>
                ) : (
                  filteredRules?.map((rule: ComplianceRule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">{rule.name}</h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded ${getSeverityColor(rule.severity)}`}>
                            {rule.severity}
                          </span>
                          <span className="px-2 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded">
                            {rule.standard.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{rule.description}</p>
                      </div>
                      <button
                        onClick={() => ruleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                        disabled={ruleMutation.isPending}
                        className={`ml-4 px-4 py-2 rounded-lg font-medium transition-colors ${
                          rule.enabled
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {rule.enabled ? (
                          <span className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4" />
                            <span>Enabled</span>
                          </span>
                        ) : (
                          <span className="flex items-center space-x-2">
                            <XCircle className="h-4 w-4" />
                            <span>Disabled</span>
                          </span>
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


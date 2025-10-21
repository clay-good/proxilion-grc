'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Play,
  Save,
  X,
  AlertTriangle,
  CheckCircle,
  FileText,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/api';

interface Policy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: PolicyCondition[];
  actions: PolicyAction[];
  createdAt: string;
  updatedAt: string;
}

interface PolicyCondition {
  type: 'threat_level' | 'pattern_match' | 'compliance_violation' | 'user_group';
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
  value: string;
}

interface PolicyAction {
  type: 'block' | 'allow' | 'alert' | 'redact' | 'log';
  parameters?: Record<string, any>;
}

async function fetchPolicies() {
  const res = await fetch(`${API_URL}/policies`);
  if (!res.ok) throw new Error('Failed to fetch policies');
  return res.json();
}

async function createPolicy(policy: Partial<Policy>) {
  const res = await fetch(`${API_URL}/policies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(policy),
  });
  if (!res.ok) throw new Error('Failed to create policy');
  return res.json();
}

async function updatePolicy(id: string, policy: Partial<Policy>) {
  const res = await fetch(`${API_URL}/policies/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(policy),
  });
  if (!res.ok) throw new Error('Failed to update policy');
  return res.json();
}

async function deletePolicy(id: string) {
  const res = await fetch(`${API_URL}/policies/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete policy');
  return res.json();
}

async function testPolicy(policy: Partial<Policy>, testData: string) {
  const res = await fetch(`${API_URL}/policies/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy, testData }),
  });
  if (!res.ok) throw new Error('Failed to test policy');
  return res.json();
}

export default function PoliciesPage() {
  const queryClient = useQueryClient();
  const [showEditor, setShowEditor] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [testData, setTestData] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  const { data: policies, isLoading } = useQuery({
    queryKey: ['policies'],
    queryFn: fetchPolicies,
  });

  const createMutation = useMutation({
    mutationFn: createPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setShowEditor(false);
      setEditingPolicy(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, policy }: { id: string; policy: Partial<Policy> }) =>
      updatePolicy(id, policy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setShowEditor(false);
      setEditingPolicy(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });

  const handleSave = (policy: Partial<Policy>) => {
    if (editingPolicy) {
      updateMutation.mutate({ id: editingPolicy.id, policy });
    } else {
      createMutation.mutate(policy);
    }
  };

  const handleTest = async (policy: Partial<Policy>) => {
    try {
      const result = await testPolicy(policy, testData);
      setTestResult(result);
    } catch (error) {
      console.error('Test failed:', error);
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
                <h1 className="text-2xl font-bold text-gray-900">Policy Management</h1>
                <p className="text-sm text-gray-500">Create and manage security policies</p>
              </div>
            </div>
            <button
              onClick={() => {
                setEditingPolicy(null);
                setShowEditor(true);
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              <span>New Policy</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Policy List */}
        {!showEditor && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Policies</h2>
              
              {isLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading policies...</p>
                </div>
              ) : policies?.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No policies configured</p>
                  <button
                    onClick={() => setShowEditor(true)}
                    className="mt-4 text-primary-600 hover:text-primary-700"
                  >
                    Create your first policy
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {policies?.map((policy: Policy) => (
                    <div
                      key={policy.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">{policy.name}</h3>
                          {policy.enabled ? (
                            <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded">
                              Enabled
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded">
                              Disabled
                            </span>
                          )}
                          <span className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded">
                            Priority: {policy.priority}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{policy.description}</p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>{policy.conditions.length} conditions</span>
                          <span>{policy.actions.length} actions</span>
                          <span>Updated: {new Date(policy.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => {
                            setEditingPolicy(policy);
                            setShowEditor(true);
                          }}
                          className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this policy?')) {
                              deleteMutation.mutate(policy.id);
                            }
                          }}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Policy Editor */}
        {showEditor && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingPolicy ? 'Edit Policy' : 'Create New Policy'}
                </h2>
                <button
                  onClick={() => {
                    setShowEditor(false);
                    setEditingPolicy(null);
                  }}
                  className="p-2 text-gray-600 hover:text-gray-900 rounded"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Policy Name
                  </label>
                  <input
                    type="text"
                    defaultValue={editingPolicy?.name}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., Block Critical PII"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    defaultValue={editingPolicy?.description}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Describe what this policy does..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Priority
                    </label>
                    <input
                      type="number"
                      defaultValue={editingPolicy?.priority || 100}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <select
                      defaultValue={editingPolicy?.enabled ? 'enabled' : 'disabled'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="enabled">Enabled</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => handleSave({})}
                    className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Policy</span>
                  </button>
                  <button
                    onClick={() => handleTest({})}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    <Play className="h-4 w-4" />
                    <span>Test Policy</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


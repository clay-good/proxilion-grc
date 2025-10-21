/**
 * Prompt Version Manager
 * 
 * Git-like version control for prompts:
 * - Track all prompt changes
 * - Create versions with metadata
 * - Diff between versions
 * - Rollback to previous versions
 * - Branch and merge prompts
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface PromptVersion {
  id: string;                    // Version ID (UUID)
  promptId: string;              // Prompt ID
  version: number;               // Version number (1, 2, 3, ...)
  content: string;               // Prompt content
  variables: string[];           // Variables used in prompt
  author: string;                // Who created this version
  message: string;               // Commit message
  tags: string[];                // Tags for categorization
  metadata: Record<string, any>; // Additional metadata
  parentVersionId?: string;      // Parent version (for branching)
  createdAt: number;             // Timestamp
  status: 'draft' | 'active' | 'archived' | 'deprecated';
}

export interface PromptDiff {
  promptId: string;
  fromVersion: number;
  toVersion: number;
  changes: Array<{
    type: 'added' | 'removed' | 'modified';
    line: number;
    content: string;
  }>;
  variablesAdded: string[];
  variablesRemoved: string[];
  summary: string;
}

export interface PromptBranch {
  id: string;
  promptId: string;
  name: string;
  baseVersionId: string;
  headVersionId: string;
  createdAt: number;
  createdBy: string;
  status: 'active' | 'merged' | 'abandoned';
}

export class PromptVersionManager {
  private logger: Logger;
  private metrics: MetricsCollector;
  
  // Storage
  private versions: Map<string, PromptVersion[]> = new Map(); // promptId -> versions
  private branches: Map<string, PromptBranch[]> = new Map();  // promptId -> branches
  private activeVersions: Map<string, string> = new Map();    // promptId -> versionId

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Create a new prompt version
   */
  createVersion(params: {
    promptId: string;
    content: string;
    author: string;
    message: string;
    tags?: string[];
    metadata?: Record<string, any>;
    parentVersionId?: string;
    status?: 'draft' | 'active' | 'archived' | 'deprecated';
  }): PromptVersion {
    const versions = this.versions.get(params.promptId) || [];
    const versionNumber = versions.length + 1;
    
    // Extract variables from content (e.g., {{variable}})
    const variables = this.extractVariables(params.content);
    
    const version: PromptVersion = {
      id: crypto.randomUUID(),
      promptId: params.promptId,
      version: versionNumber,
      content: params.content,
      variables,
      author: params.author,
      message: params.message,
      tags: params.tags || [],
      metadata: params.metadata || {},
      parentVersionId: params.parentVersionId,
      createdAt: Date.now(),
      status: params.status || 'draft',
    };

    versions.push(version);
    this.versions.set(params.promptId, versions);

    // If status is active, set as active version
    if (version.status === 'active') {
      this.activeVersions.set(params.promptId, version.id);
    }

    this.logger.info('Prompt version created', {
      promptId: params.promptId,
      versionId: version.id,
      version: versionNumber,
      author: params.author,
    });

    this.metrics.increment('prompt_version_created_total', 1, {
      promptId: params.promptId,
      status: version.status,
    });

    return version;
  }

  /**
   * Get a specific version
   */
  getVersion(promptId: string, versionNumber: number): PromptVersion | undefined {
    const versions = this.versions.get(promptId);
    return versions?.find(v => v.version === versionNumber);
  }

  /**
   * Get version by ID
   */
  getVersionById(versionId: string): PromptVersion | undefined {
    for (const versions of this.versions.values()) {
      const version = versions.find(v => v.id === versionId);
      if (version) return version;
    }
    return undefined;
  }

  /**
   * Get all versions for a prompt
   */
  getVersions(promptId: string): PromptVersion[] {
    return this.versions.get(promptId) || [];
  }

  /**
   * Get active version
   */
  getActiveVersion(promptId: string): PromptVersion | undefined {
    const versionId = this.activeVersions.get(promptId);
    if (!versionId) return undefined;
    return this.getVersionById(versionId);
  }

  /**
   * Set active version
   */
  setActiveVersion(promptId: string, versionNumber: number): boolean {
    const version = this.getVersion(promptId, versionNumber);
    if (!version) {
      this.logger.warn('Version not found', { promptId, versionNumber });
      return false;
    }

    // Update status
    version.status = 'active';
    
    // Deactivate previous active version
    const previousActive = this.getActiveVersion(promptId);
    if (previousActive && previousActive.id !== version.id) {
      previousActive.status = 'archived';
    }

    this.activeVersions.set(promptId, version.id);

    this.logger.info('Active version updated', {
      promptId,
      versionId: version.id,
      version: versionNumber,
    });

    this.metrics.increment('prompt_version_activated_total', 1, {
      promptId,
    });

    return true;
  }

  /**
   * Rollback to a previous version
   */
  rollback(promptId: string, targetVersion: number, author: string, message?: string): PromptVersion | null {
    const targetVersionData = this.getVersion(promptId, targetVersion);
    if (!targetVersionData) {
      this.logger.warn('Target version not found', { promptId, targetVersion });
      return null;
    }

    // Create new version with content from target version
    const newVersion = this.createVersion({
      promptId,
      content: targetVersionData.content,
      author,
      message: message || `Rollback to version ${targetVersion}`,
      tags: [...targetVersionData.tags, 'rollback'],
      metadata: {
        ...targetVersionData.metadata,
        rolledBackFrom: targetVersion,
      },
      status: 'active',
    });

    this.logger.info('Prompt rolled back', {
      promptId,
      fromVersion: this.getVersions(promptId).length - 1,
      toVersion: targetVersion,
      newVersion: newVersion.version,
    });

    this.metrics.increment('prompt_version_rollback_total', 1, {
      promptId,
    });

    return newVersion;
  }

  /**
   * Calculate diff between two versions
   */
  diff(promptId: string, fromVersion: number, toVersion: number): PromptDiff | null {
    const from = this.getVersion(promptId, fromVersion);
    const to = this.getVersion(promptId, toVersion);

    if (!from || !to) {
      this.logger.warn('Version not found for diff', { promptId, fromVersion, toVersion });
      return null;
    }

    const fromLines = from.content.split('\n');
    const toLines = to.content.split('\n');

    const changes: PromptDiff['changes'] = [];
    const maxLines = Math.max(fromLines.length, toLines.length);

    for (let i = 0; i < maxLines; i++) {
      const fromLine = fromLines[i];
      const toLine = toLines[i];

      if (fromLine === undefined && toLine !== undefined) {
        changes.push({ type: 'added', line: i + 1, content: toLine });
      } else if (fromLine !== undefined && toLine === undefined) {
        changes.push({ type: 'removed', line: i + 1, content: fromLine });
      } else if (fromLine !== toLine) {
        changes.push({ type: 'modified', line: i + 1, content: toLine });
      }
    }

    const variablesAdded = to.variables.filter(v => !from.variables.includes(v));
    const variablesRemoved = from.variables.filter(v => !to.variables.includes(v));

    const summary = `${changes.length} changes: ${changes.filter(c => c.type === 'added').length} added, ${changes.filter(c => c.type === 'removed').length} removed, ${changes.filter(c => c.type === 'modified').length} modified`;

    return {
      promptId,
      fromVersion,
      toVersion,
      changes,
      variablesAdded,
      variablesRemoved,
      summary,
    };
  }

  /**
   * Create a branch
   */
  createBranch(params: {
    promptId: string;
    name: string;
    baseVersionId: string;
    createdBy: string;
  }): PromptBranch {
    const branch: PromptBranch = {
      id: crypto.randomUUID(),
      promptId: params.promptId,
      name: params.name,
      baseVersionId: params.baseVersionId,
      headVersionId: params.baseVersionId,
      createdAt: Date.now(),
      createdBy: params.createdBy,
      status: 'active',
    };

    const branches = this.branches.get(params.promptId) || [];
    branches.push(branch);
    this.branches.set(params.promptId, branches);

    this.logger.info('Branch created', {
      promptId: params.promptId,
      branchId: branch.id,
      name: params.name,
    });

    return branch;
  }

  /**
   * Get branches for a prompt
   */
  getBranches(promptId: string): PromptBranch[] {
    return this.branches.get(promptId) || [];
  }

  /**
   * Extract variables from prompt content
   */
  private extractVariables(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    return variables;
  }

  /**
   * Get version history
   */
  getHistory(promptId: string, limit?: number): PromptVersion[] {
    const versions = this.getVersions(promptId);
    const sorted = [...versions].sort((a, b) => b.createdAt - a.createdAt);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Search versions by tags
   */
  searchByTags(promptId: string, tags: string[]): PromptVersion[] {
    const versions = this.getVersions(promptId);
    return versions.filter(v => 
      tags.some(tag => v.tags.includes(tag))
    );
  }

  /**
   * Get statistics
   */
  getStats(promptId: string): {
    totalVersions: number;
    activeVersion?: number;
    authors: string[];
    totalBranches: number;
    oldestVersion?: number;
    newestVersion?: number;
  } {
    const versions = this.getVersions(promptId);
    const branches = this.getBranches(promptId);
    const activeVersion = this.getActiveVersion(promptId);

    return {
      totalVersions: versions.length,
      activeVersion: activeVersion?.version,
      authors: [...new Set(versions.map(v => v.author))],
      totalBranches: branches.length,
      oldestVersion: versions[0]?.createdAt,
      newestVersion: versions[versions.length - 1]?.createdAt,
    };
  }
}


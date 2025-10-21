/**
 * Workflow Version Manager
 * 
 * Manages workflow versions with Git-like version control.
 */

import { Logger } from '../utils/logger.js';
import { WorkflowDefinition } from './workflow-types.js';
import { v4 as uuidv4 } from 'uuid';

export interface WorkflowVersion {
  versionId: string;
  workflowId: string;
  version: string;
  workflow: WorkflowDefinition;
  changelog?: string;
  createdAt: number;
  createdBy?: string;
  tags?: string[];
  parentVersion?: string;
}

export interface VersionDiff {
  added: string[];
  removed: string[];
  modified: string[];
  details: Record<string, any>;
}

export class WorkflowVersionManager {
  private logger: Logger;
  private versions: Map<string, WorkflowVersion[]>;  // workflowId -> versions
  private versionIndex: Map<string, WorkflowVersion>;  // versionId -> version

  constructor() {
    this.logger = new Logger();
    this.versions = new Map();
    this.versionIndex = new Map();
  }

  /**
   * Create a new version
   */
  createVersion(
    workflow: WorkflowDefinition,
    changelog?: string,
    createdBy?: string,
    tags?: string[]
  ): WorkflowVersion {
    const versionId = uuidv4();
    const existingVersions = this.versions.get(workflow.id) || [];
    const parentVersion = existingVersions.length > 0 
      ? existingVersions[existingVersions.length - 1].versionId 
      : undefined;

    const version: WorkflowVersion = {
      versionId,
      workflowId: workflow.id,
      version: workflow.version,
      workflow: JSON.parse(JSON.stringify(workflow)),  // Deep clone
      changelog,
      createdAt: Date.now(),
      createdBy,
      tags,
      parentVersion,
    };

    // Store version
    if (!this.versions.has(workflow.id)) {
      this.versions.set(workflow.id, []);
    }
    this.versions.get(workflow.id)!.push(version);
    this.versionIndex.set(versionId, version);

    this.logger.info('Created workflow version', {
      workflowId: workflow.id,
      versionId,
      version: workflow.version,
    });

    return version;
  }

  /**
   * Get a specific version
   */
  getVersion(versionId: string): WorkflowVersion | undefined {
    return this.versionIndex.get(versionId);
  }

  /**
   * Get all versions of a workflow
   */
  getVersions(workflowId: string): WorkflowVersion[] {
    return this.versions.get(workflowId) || [];
  }

  /**
   * Get latest version
   */
  getLatestVersion(workflowId: string): WorkflowVersion | undefined {
    const versions = this.versions.get(workflowId);
    if (!versions || versions.length === 0) {
      return undefined;
    }
    return versions[versions.length - 1];
  }

  /**
   * Get version by semantic version string
   */
  getVersionByString(workflowId: string, versionString: string): WorkflowVersion | undefined {
    const versions = this.versions.get(workflowId);
    if (!versions) {
      return undefined;
    }
    return versions.find(v => v.version === versionString);
  }

  /**
   * Rollback to a previous version
   */
  rollback(workflowId: string, targetVersionId: string): WorkflowVersion {
    const targetVersion = this.versionIndex.get(targetVersionId);
    if (!targetVersion) {
      throw new Error(`Version not found: ${targetVersionId}`);
    }

    if (targetVersion.workflowId !== workflowId) {
      throw new Error('Version does not belong to this workflow');
    }

    // Create new version based on target
    const newWorkflow = {
      ...targetVersion.workflow,
      version: this.incrementVersion(targetVersion.workflow.version),
      updatedAt: Date.now(),
    };

    return this.createVersion(
      newWorkflow,
      `Rolled back to version ${targetVersion.version}`,
      undefined,
      ['rollback']
    );
  }

  /**
   * Compare two versions
   */
  diff(versionId1: string, versionId2: string): VersionDiff {
    const v1 = this.versionIndex.get(versionId1);
    const v2 = this.versionIndex.get(versionId2);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    const diff: VersionDiff = {
      added: [],
      removed: [],
      modified: [],
      details: {},
    };

    // Compare steps
    const steps1 = new Map(v1.workflow.steps.map(s => [s.id, s]));
    const steps2 = new Map(v2.workflow.steps.map(s => [s.id, s]));

    // Find added steps
    for (const [id, step] of steps2) {
      if (!steps1.has(id)) {
        diff.added.push(`step:${id}`);
        diff.details[`step:${id}`] = { type: 'added', step };
      }
    }

    // Find removed and modified steps
    for (const [id, step1] of steps1) {
      if (!steps2.has(id)) {
        diff.removed.push(`step:${id}`);
        diff.details[`step:${id}`] = { type: 'removed', step: step1 };
      } else {
        const step2 = steps2.get(id)!;
        if (JSON.stringify(step1) !== JSON.stringify(step2)) {
          diff.modified.push(`step:${id}`);
          diff.details[`step:${id}`] = {
            type: 'modified',
            before: step1,
            after: step2,
          };
        }
      }
    }

    // Compare other properties
    if (v1.workflow.entryPoint !== v2.workflow.entryPoint) {
      diff.modified.push('entryPoint');
      diff.details.entryPoint = {
        before: v1.workflow.entryPoint,
        after: v2.workflow.entryPoint,
      };
    }

    if (JSON.stringify(v1.workflow.variables) !== JSON.stringify(v2.workflow.variables)) {
      diff.modified.push('variables');
      diff.details.variables = {
        before: v1.workflow.variables,
        after: v2.workflow.variables,
      };
    }

    return diff;
  }

  /**
   * Tag a version
   */
  tagVersion(versionId: string, tag: string): void {
    const version = this.versionIndex.get(versionId);
    if (!version) {
      throw new Error(`Version not found: ${versionId}`);
    }

    if (!version.tags) {
      version.tags = [];
    }

    if (!version.tags.includes(tag)) {
      version.tags.push(tag);
      this.logger.info('Tagged version', { versionId, tag });
    }
  }

  /**
   * Get versions by tag
   */
  getVersionsByTag(workflowId: string, tag: string): WorkflowVersion[] {
    const versions = this.versions.get(workflowId);
    if (!versions) {
      return [];
    }
    return versions.filter(v => v.tags && v.tags.includes(tag));
  }

  /**
   * Delete a version
   */
  deleteVersion(versionId: string): boolean {
    const version = this.versionIndex.get(versionId);
    if (!version) {
      return false;
    }

    const versions = this.versions.get(version.workflowId);
    if (versions) {
      const index = versions.findIndex(v => v.versionId === versionId);
      if (index !== -1) {
        versions.splice(index, 1);
      }
    }

    this.versionIndex.delete(versionId);
    this.logger.info('Deleted version', { versionId });
    return true;
  }

  /**
   * Get version history
   */
  getHistory(workflowId: string): Array<{
    versionId: string;
    version: string;
    changelog?: string;
    createdAt: number;
    createdBy?: string;
    tags?: string[];
  }> {
    const versions = this.versions.get(workflowId) || [];
    return versions.map(v => ({
      versionId: v.versionId,
      version: v.version,
      changelog: v.changelog,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      tags: v.tags,
    }));
  }

  /**
   * Increment semantic version
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    if (parts.length !== 3) {
      return '1.0.0';
    }

    const [major, minor, patch] = parts.map(Number);
    return `${major}.${minor}.${patch + 1}`;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalWorkflows: number;
    totalVersions: number;
    averageVersionsPerWorkflow: number;
    mostVersionedWorkflows: Array<{ workflowId: string; versionCount: number }>;
  } {
    const totalWorkflows = this.versions.size;
    const totalVersions = this.versionIndex.size;
    const averageVersionsPerWorkflow = totalWorkflows > 0 ? totalVersions / totalWorkflows : 0;

    const mostVersioned = Array.from(this.versions.entries())
      .map(([workflowId, versions]) => ({
        workflowId,
        versionCount: versions.length,
      }))
      .sort((a, b) => b.versionCount - a.versionCount)
      .slice(0, 10);

    return {
      totalWorkflows,
      totalVersions,
      averageVersionsPerWorkflow,
      mostVersionedWorkflows: mostVersioned,
    };
  }

  /**
   * Clear all versions
   */
  clear(): void {
    this.versions.clear();
    this.versionIndex.clear();
    this.logger.info('Cleared all workflow versions');
  }
}


/**
 * Response Filter
 * 
 * Filters and modifies AI responses based on policies and scan results
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { UnifiedAIResponse, AIServiceProvider } from '../types/index.js';
import { ThreatLevel } from '../types/index.js';
import { ResponseScanResult } from './response-scanner.js';

export interface ResponseFilterConfig {
  blockOnCritical: boolean;
  blockOnHigh: boolean;
  warnOnMedium: boolean;
  maxContentLength?: number;
  allowedContentTypes: string[];
  blockedKeywords: string[];
  requiredDisclaimer?: string;
  enableContentModeration: boolean;
  enableLengthLimits: boolean;
  enableKeywordFiltering: boolean;
}

export interface FilterResult {
  allowed: boolean;
  modified: boolean;
  blocked: boolean;
  response: UnifiedAIResponse;
  reason?: string;
  appliedFilters: string[];
  metadata: {
    filteredAt: number;
    duration: number;
  };
}

export class ResponseFilter {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: Required<ResponseFilterConfig>;

  constructor(config?: Partial<ResponseFilterConfig>) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();

    this.config = {
      blockOnCritical: config?.blockOnCritical ?? true,
      blockOnHigh: config?.blockOnHigh ?? false,
      warnOnMedium: config?.warnOnMedium ?? true,
      maxContentLength: config?.maxContentLength ?? 10000,
      allowedContentTypes: config?.allowedContentTypes ?? ['text', 'code', 'json'],
      blockedKeywords: config?.blockedKeywords ?? [],
      requiredDisclaimer: config?.requiredDisclaimer ?? '',
      enableContentModeration: config?.enableContentModeration ?? true,
      enableLengthLimits: config?.enableLengthLimits ?? false,
      enableKeywordFiltering: config?.enableKeywordFiltering ?? true,
    };

    this.logger.info('Response filter initialized', {
      blockOnCritical: this.config.blockOnCritical,
      blockOnHigh: this.config.blockOnHigh,
      enableContentModeration: this.config.enableContentModeration,
    });
  }

  /**
   * Filter response based on scan results and policies
   */
  async filterResponse(
    response: UnifiedAIResponse,
    scanResult: ResponseScanResult
  ): Promise<FilterResult> {
    const startTime = Date.now();
    const appliedFilters: string[] = [];
    // Use shallow clone for better performance - deep clone only if we modify
    let filteredResponse = response;
    let blocked = false;
    let modified = false;
    let reason: string | undefined;

    try {
      // Check threat level
      if (this.config.blockOnCritical && scanResult.threatLevel === ThreatLevel.CRITICAL) {
        blocked = true;
        reason = 'Response blocked due to critical threat level';
        appliedFilters.push('threat_level_critical');
        filteredResponse = this.createBlockedResponse(reason);
      } else if (this.config.blockOnHigh && scanResult.threatLevel === ThreatLevel.HIGH) {
        blocked = true;
        reason = 'Response blocked due to high threat level';
        appliedFilters.push('threat_level_high');
        filteredResponse = this.createBlockedResponse(reason);
      }

      // Use redacted response if available
      if (!blocked && scanResult.redactedResponse) {
        filteredResponse = scanResult.redactedResponse;
        modified = true;
        appliedFilters.push('redaction');
      }

      // Apply content moderation
      if (!blocked && this.config.enableContentModeration) {
        const moderationResult = this.moderateContent(filteredResponse);
        if (moderationResult.modified) {
          filteredResponse = moderationResult.response;
          modified = true;
          appliedFilters.push('content_moderation');
        }
      }

      // Apply length limits
      if (!blocked && this.config.enableLengthLimits && this.config.maxContentLength) {
        const lengthResult = this.applyLengthLimits(filteredResponse);
        if (lengthResult.modified) {
          filteredResponse = lengthResult.response;
          modified = true;
          appliedFilters.push('length_limit');
        }
      }

      // Apply keyword filtering
      if (!blocked && this.config.enableKeywordFiltering && this.config.blockedKeywords.length > 0) {
        const keywordResult = this.filterKeywords(filteredResponse);
        if (keywordResult.modified) {
          filteredResponse = keywordResult.response;
          modified = true;
          appliedFilters.push('keyword_filter');
        }
      }

      // Add disclaimer if required
      if (!blocked && this.config.requiredDisclaimer) {
        filteredResponse = this.addDisclaimer(filteredResponse);
        modified = true;
        appliedFilters.push('disclaimer');
      }

      const duration = Date.now() - startTime;

      // Log filtering
      if (blocked || modified) {
        this.logger.info('Response filtered', {
          blocked,
          modified,
          appliedFilters,
          reason,
        });
      }

      // Collect metrics
      this.metrics.increment('response_filter_total');
      if (blocked) {
        this.metrics.increment('response_filter_blocked_total');
      }
      if (modified) {
        this.metrics.increment('response_filter_modified_total');
      }
      this.metrics.histogram('response_filter_duration_ms', duration);

      return {
        allowed: !blocked,
        modified,
        blocked,
        response: filteredResponse,
        reason,
        appliedFilters,
        metadata: {
          filteredAt: Date.now(),
          duration,
        },
      };
    } catch (error) {
      this.logger.error('Response filter error', error as Error);
      throw error;
    }
  }

  /**
   * Create blocked response
   */
  private createBlockedResponse(reason: string): UnifiedAIResponse {
    return {
      provider: AIServiceProvider.CUSTOM,
      model: 'proxilion-filter',
      content: `This response has been blocked by Proxilion security policies. Reason: ${reason}`,
      finishReason: 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  /**
   * Moderate content
   */
  private moderateContent(response: UnifiedAIResponse): {
    response: UnifiedAIResponse;
    modified: boolean;
  } {
    const moderated = JSON.parse(JSON.stringify(response)) as UnifiedAIResponse;
    let modified = false;

    const original = moderated.content || '';
    let content = original;

    // Remove excessive profanity markers
    content = content.replace(/\*{3,}/g, '***');

    // Normalize whitespace
    content = content.replace(/\s{3,}/g, '  ');

    // Remove control characters
    content = content.replace(/[\x00-\x1F\x7F]/g, '');

    if (content !== original) {
      moderated.content = content;
      modified = true;
    }

    return { response: moderated, modified };
  }

  /**
   * Apply length limits
   */
  private applyLengthLimits(response: UnifiedAIResponse): {
    response: UnifiedAIResponse;
    modified: boolean;
  } {
    if (!this.config.maxContentLength) {
      return { response, modified: false };
    }

    const limited = JSON.parse(JSON.stringify(response)) as UnifiedAIResponse;
    let modified = false;

    const original = limited.content || '';
    if (original.length > this.config.maxContentLength) {
      limited.content =
        original.substring(0, this.config.maxContentLength) +
        '\n\n[Content truncated by Proxilion due to length limits]';
      modified = true;
    }

    return { response: limited, modified };
  }

  /**
   * Filter blocked keywords
   */
  private filterKeywords(response: UnifiedAIResponse): {
    response: UnifiedAIResponse;
    modified: boolean;
  } {
    const filtered = JSON.parse(JSON.stringify(response)) as UnifiedAIResponse;
    let modified = false;

    let content = filtered.content || '';
    const original = content;

    for (const keyword of this.config.blockedKeywords) {
      const regex = new RegExp(keyword, 'gi');
      content = content.replace(regex, '[FILTERED]');
    }

    if (content !== original) {
      filtered.content = content;
      modified = true;
    }

    return { response: filtered, modified };
  }

  /**
   * Add disclaimer to response
   */
  private addDisclaimer(response: UnifiedAIResponse): UnifiedAIResponse {
    const withDisclaimer = JSON.parse(JSON.stringify(response)) as UnifiedAIResponse;

    withDisclaimer.content = `${withDisclaimer.content || ''}\n\n---\n${this.config.requiredDisclaimer}`;

    return withDisclaimer;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ResponseFilterConfig>): void {
    Object.assign(this.config, config);
    this.logger.info('Response filter configuration updated', config);
  }

  /**
   * Get current configuration
   */
  getConfig(): ResponseFilterConfig {
    return { ...this.config };
  }
}


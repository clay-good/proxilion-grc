/**
 * Geo-based Router
 * 
 * Routes requests to the nearest provider region based on:
 * - Geographic proximity
 * - Regional availability
 * - Data residency requirements
 * - Latency optimization
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type Region = 
  | 'us-east-1' | 'us-west-1' | 'us-west-2'
  | 'eu-west-1' | 'eu-central-1' | 'eu-north-1'
  | 'ap-southeast-1' | 'ap-northeast-1' | 'ap-south-1'
  | 'ca-central-1' | 'sa-east-1' | 'me-south-1'
  | 'af-south-1' | 'ap-east-1';

export type Provider = 'openai' | 'anthropic' | 'google' | 'cohere' | 'azure-openai';

export interface ProviderRegion {
  provider: Provider;
  region: Region;
  endpoint: string;
  available: boolean;
  latency?: number;        // Average latency in ms
  dataResidency: string[]; // Supported data residency regions (e.g., ['EU', 'US'])
}

export interface GeoRoutingConfig {
  preferredRegions: Region[];      // Preferred regions in order
  dataResidencyRequired: boolean;  // Enforce data residency
  dataResidencyRegion?: string;    // Required data residency (e.g., 'EU', 'US')
  maxLatency?: number;             // Maximum acceptable latency in ms
  fallbackToAnyRegion: boolean;    // Fallback to any region if preferred unavailable
}

export interface GeoRoutingResult {
  provider: Provider;
  region: Region;
  endpoint: string;
  estimatedLatency: number;
  reason: string;
}

export class GeoRouter {
  private logger: Logger;
  private metrics: MetricsCollector;
  
  // Provider region mappings
  private providerRegions: Map<string, ProviderRegion> = new Map();
  
  // Region coordinates for distance calculation
  private regionCoordinates: Map<Region, { lat: number; lon: number }> = new Map([
    ['us-east-1', { lat: 39.0, lon: -77.5 }],      // Virginia
    ['us-west-1', { lat: 37.4, lon: -122.1 }],     // N. California
    ['us-west-2', { lat: 45.5, lon: -122.7 }],     // Oregon
    ['eu-west-1', { lat: 53.3, lon: -6.3 }],       // Ireland
    ['eu-central-1', { lat: 50.1, lon: 8.7 }],     // Frankfurt
    ['eu-north-1', { lat: 59.3, lon: 18.1 }],      // Stockholm
    ['ap-southeast-1', { lat: 1.3, lon: 103.8 }],  // Singapore
    ['ap-northeast-1', { lat: 35.7, lon: 139.7 }], // Tokyo
    ['ap-south-1', { lat: 19.1, lon: 72.9 }],      // Mumbai
    ['ca-central-1', { lat: 45.5, lon: -73.6 }],   // Montreal
    ['sa-east-1', { lat: -23.5, lon: -46.6 }],     // São Paulo
    ['me-south-1', { lat: 26.1, lon: 50.6 }],      // Bahrain
    ['af-south-1', { lat: -33.9, lon: 18.4 }],     // Cape Town
    ['ap-east-1', { lat: 22.3, lon: 114.2 }],      // Hong Kong
  ]);

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    // Initialize provider regions
    this.initializeProviderRegions();
  }

  /**
   * Initialize provider region mappings
   */
  private initializeProviderRegions(): void {
    // OpenAI regions
    this.addProviderRegion({
      provider: 'openai',
      region: 'us-east-1',
      endpoint: 'https://api.openai.com',
      available: true,
      dataResidency: ['US', 'GLOBAL'],
    });

    // Anthropic regions
    this.addProviderRegion({
      provider: 'anthropic',
      region: 'us-east-1',
      endpoint: 'https://api.anthropic.com',
      available: true,
      dataResidency: ['US', 'GLOBAL'],
    });

    // Google AI regions
    this.addProviderRegion({
      provider: 'google',
      region: 'us-east-1',
      endpoint: 'https://generativelanguage.googleapis.com',
      available: true,
      dataResidency: ['US', 'GLOBAL'],
    });

    this.addProviderRegion({
      provider: 'google',
      region: 'eu-west-1',
      endpoint: 'https://eu-generativelanguage.googleapis.com',
      available: true,
      dataResidency: ['EU', 'GLOBAL'],
    });

    // Cohere regions
    this.addProviderRegion({
      provider: 'cohere',
      region: 'us-east-1',
      endpoint: 'https://api.cohere.ai',
      available: true,
      dataResidency: ['US', 'GLOBAL'],
    });

    // Azure OpenAI regions
    this.addProviderRegion({
      provider: 'azure-openai',
      region: 'us-east-1',
      endpoint: 'https://eastus.api.cognitive.microsoft.com',
      available: true,
      dataResidency: ['US', 'GLOBAL'],
    });

    this.addProviderRegion({
      provider: 'azure-openai',
      region: 'eu-west-1',
      endpoint: 'https://westeurope.api.cognitive.microsoft.com',
      available: true,
      dataResidency: ['EU', 'GLOBAL'],
    });

    this.addProviderRegion({
      provider: 'azure-openai',
      region: 'ap-southeast-1',
      endpoint: 'https://southeastasia.api.cognitive.microsoft.com',
      available: true,
      dataResidency: ['APAC', 'GLOBAL'],
    });
  }

  /**
   * Add provider region
   */
  addProviderRegion(region: ProviderRegion): void {
    const key = `${region.provider}:${region.region}`;
    this.providerRegions.set(key, region);
  }

  /**
   * Route request to optimal provider region
   */
  route(
    providers: Provider[],
    config: GeoRoutingConfig,
    clientRegion?: Region
  ): GeoRoutingResult | null {
    this.logger.debug('Routing request', {
      providers,
      preferredRegions: config.preferredRegions,
      clientRegion,
    });

    // Get available provider regions
    const availableRegions = this.getAvailableRegions(providers);

    if (availableRegions.length === 0) {
      this.logger.warn('No available provider regions');
      return null;
    }

    // Filter by data residency if required
    let candidateRegions = availableRegions;
    if (config.dataResidencyRequired && config.dataResidencyRegion) {
      candidateRegions = availableRegions.filter(r =>
        r.dataResidency.includes(config.dataResidencyRegion!)
      );

      if (candidateRegions.length === 0) {
        this.logger.error('No regions match data residency requirement', undefined, {
          required: config.dataResidencyRegion,
        });
        return null;
      }
    }

    // Filter by max latency if specified
    if (config.maxLatency) {
      candidateRegions = candidateRegions.filter(r =>
        !r.latency || r.latency <= config.maxLatency!
      );
    }

    // Try preferred regions first
    for (const preferredRegion of config.preferredRegions) {
      const match = candidateRegions.find(r => r.region === preferredRegion);
      if (match) {
        this.metrics.increment('geo_router_route_total', 1, {
          provider: match.provider,
          region: match.region,
          reason: 'preferred_region',
        });

        return {
          provider: match.provider,
          region: match.region,
          endpoint: match.endpoint,
          estimatedLatency: match.latency || 0,
          reason: 'Preferred region match',
        };
      }
    }

    // If client region provided, find nearest region
    if (clientRegion) {
      const nearest = this.findNearestRegion(candidateRegions, clientRegion);
      if (nearest) {
        const distance = this.calculateDistance(clientRegion, nearest.region);
        
        this.metrics.increment('geo_router_route_total', 1, {
          provider: nearest.provider,
          region: nearest.region,
          reason: 'nearest_region',
        });

        return {
          provider: nearest.provider,
          region: nearest.region,
          endpoint: nearest.endpoint,
          estimatedLatency: nearest.latency || this.estimateLatency(distance),
          reason: `Nearest region (${distance.toFixed(0)}km away)`,
        };
      }
    }

    // Fallback to any available region
    if (config.fallbackToAnyRegion && candidateRegions.length > 0) {
      const fallback = candidateRegions[0];
      
      this.metrics.increment('geo_router_route_total', 1, {
        provider: fallback.provider,
        region: fallback.region,
        reason: 'fallback',
      });

      return {
        provider: fallback.provider,
        region: fallback.region,
        endpoint: fallback.endpoint,
        estimatedLatency: fallback.latency || 0,
        reason: 'Fallback to available region',
      };
    }

    this.logger.warn('No suitable region found');
    return null;
  }

  /**
   * Get available regions for providers
   */
  private getAvailableRegions(providers: Provider[]): ProviderRegion[] {
    const regions: ProviderRegion[] = [];

    for (const [key, region] of this.providerRegions.entries()) {
      if (providers.includes(region.provider) && region.available) {
        regions.push(region);
      }
    }

    return regions;
  }

  /**
   * Find nearest region to client
   */
  private findNearestRegion(
    regions: ProviderRegion[],
    clientRegion: Region
  ): ProviderRegion | null {
    if (regions.length === 0) {
      return null;
    }

    let nearest = regions[0];
    let minDistance = this.calculateDistance(clientRegion, nearest.region);

    for (const region of regions.slice(1)) {
      const distance = this.calculateDistance(clientRegion, region.region);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = region;
      }
    }

    return nearest;
  }

  /**
   * Calculate distance between two regions (Haversine formula)
   */
  private calculateDistance(region1: Region, region2: Region): number {
    const coord1 = this.regionCoordinates.get(region1);
    const coord2 = this.regionCoordinates.get(region2);

    if (!coord1 || !coord2) {
      return Infinity;
    }

    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(coord2.lat - coord1.lat);
    const dLon = this.toRadians(coord2.lon - coord1.lon);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(coord1.lat)) *
        Math.cos(this.toRadians(coord2.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Estimate latency based on distance
   */
  private estimateLatency(distanceKm: number): number {
    // Rough estimate: ~1ms per 100km + base latency
    return Math.round(distanceKm / 100 + 20);
  }

  /**
   * Update region availability
   */
  updateRegionAvailability(provider: Provider, region: Region, available: boolean): void {
    const key = `${provider}:${region}`;
    const providerRegion = this.providerRegions.get(key);

    if (providerRegion) {
      providerRegion.available = available;
      
      this.logger.info('Region availability updated', {
        provider,
        region,
        available,
      });

      this.metrics.gauge('geo_router_region_available', available ? 1 : 0, {
        provider,
        region,
      });
    }
  }

  /**
   * Update region latency
   */
  updateRegionLatency(provider: Provider, region: Region, latency: number): void {
    const key = `${provider}:${region}`;
    const providerRegion = this.providerRegions.get(key);

    if (providerRegion) {
      providerRegion.latency = latency;
      
      this.metrics.histogram('geo_router_region_latency_ms', latency, {
        provider,
        region,
      });
    }
  }

  /**
   * Get all provider regions
   */
  getAllRegions(): ProviderRegion[] {
    return Array.from(this.providerRegions.values());
  }

  /**
   * Get regions for specific provider
   */
  getProviderRegions(provider: Provider): ProviderRegion[] {
    return Array.from(this.providerRegions.values()).filter(
      r => r.provider === provider
    );
  }
}


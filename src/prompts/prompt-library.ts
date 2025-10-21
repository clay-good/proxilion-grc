/**
 * Prompt Library
 * 
 * Centralized repository for prompts:
 * - Store and organize prompts
 * - Search by tags, categories, keywords
 * - Rate and review prompts
 * - Share prompts across teams
 * - Import/export prompts
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { PromptVersion } from './prompt-version-manager.js';

export interface Prompt {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  teamId?: string;
  organizationId?: string;
  visibility: 'private' | 'team' | 'organization' | 'public';
  currentVersionId: string;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  rating: number;              // Average rating (1-5)
  ratingCount: number;         // Number of ratings
  favoriteCount: number;
  metadata: Record<string, any>;
}

export interface PromptRating {
  id: string;
  promptId: string;
  userId: string;
  rating: number;              // 1-5
  review?: string;
  createdAt: number;
}

export interface PromptSearchQuery {
  query?: string;              // Text search
  category?: string;
  tags?: string[];
  author?: string;
  teamId?: string;
  organizationId?: string;
  visibility?: Prompt['visibility'];
  minRating?: number;
  sortBy?: 'name' | 'rating' | 'usage' | 'created' | 'updated';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface PromptSearchResult {
  prompts: Prompt[];
  total: number;
  offset: number;
  limit: number;
}

export class PromptLibrary {
  private logger: Logger;
  private metrics: MetricsCollector;
  
  // Storage
  private prompts: Map<string, Prompt> = new Map();
  private ratings: Map<string, PromptRating[]> = new Map(); // promptId -> ratings
  private favorites: Map<string, Set<string>> = new Map();  // userId -> promptIds
  
  // Indexes for fast search
  private categoryIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private authorIndex: Map<string, Set<string>> = new Map();

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Create a new prompt
   */
  createPrompt(params: {
    name: string;
    description: string;
    category: string;
    tags: string[];
    author: string;
    teamId?: string;
    organizationId?: string;
    visibility: Prompt['visibility'];
    currentVersionId: string;
    metadata?: Record<string, any>;
  }): Prompt {
    const prompt: Prompt = {
      id: crypto.randomUUID(),
      name: params.name,
      description: params.description,
      category: params.category,
      tags: params.tags,
      author: params.author,
      teamId: params.teamId,
      organizationId: params.organizationId,
      visibility: params.visibility,
      currentVersionId: params.currentVersionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      rating: 0,
      ratingCount: 0,
      favoriteCount: 0,
      metadata: params.metadata || {},
    };

    this.prompts.set(prompt.id, prompt);
    this.updateIndexes(prompt);

    this.logger.info('Prompt created', {
      promptId: prompt.id,
      name: prompt.name,
      category: prompt.category,
    });

    this.metrics.increment('prompt_library_created_total', 1, {
      category: prompt.category,
      visibility: prompt.visibility,
    });

    return prompt;
  }

  /**
   * Get prompt by ID
   */
  getPrompt(promptId: string): Prompt | undefined {
    return this.prompts.get(promptId);
  }

  /**
   * Update prompt
   */
  updatePrompt(promptId: string, updates: Partial<Omit<Prompt, 'id' | 'createdAt'>>): Prompt | null {
    const prompt = this.prompts.get(promptId);
    if (!prompt) {
      this.logger.warn('Prompt not found', { promptId });
      return null;
    }

    // Remove from old indexes
    this.removeFromIndexes(prompt);

    // Apply updates
    Object.assign(prompt, updates, { updatedAt: Date.now() });

    // Update indexes
    this.updateIndexes(prompt);

    this.logger.info('Prompt updated', {
      promptId,
      updates: Object.keys(updates),
    });

    return prompt;
  }

  /**
   * Delete prompt
   */
  deletePrompt(promptId: string): boolean {
    const prompt = this.prompts.get(promptId);
    if (!prompt) {
      return false;
    }

    this.removeFromIndexes(prompt);
    this.prompts.delete(promptId);
    this.ratings.delete(promptId);

    // Remove from favorites
    for (const favoriteSet of this.favorites.values()) {
      favoriteSet.delete(promptId);
    }

    this.logger.info('Prompt deleted', { promptId });

    this.metrics.increment('prompt_library_deleted_total', 1, {
      category: prompt.category,
    });

    return true;
  }

  /**
   * Search prompts
   */
  search(query: PromptSearchQuery): PromptSearchResult {
    let results = Array.from(this.prompts.values());

    // Filter by category
    if (query.category) {
      const categoryPrompts = this.categoryIndex.get(query.category);
      if (categoryPrompts) {
        results = results.filter(p => categoryPrompts.has(p.id));
      } else {
        results = [];
      }
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(p => 
        query.tags!.some(tag => p.tags.includes(tag))
      );
    }

    // Filter by author
    if (query.author) {
      const authorPrompts = this.authorIndex.get(query.author);
      if (authorPrompts) {
        results = results.filter(p => authorPrompts.has(p.id));
      } else {
        results = [];
      }
    }

    // Filter by team
    if (query.teamId) {
      results = results.filter(p => p.teamId === query.teamId);
    }

    // Filter by organization
    if (query.organizationId) {
      results = results.filter(p => p.organizationId === query.organizationId);
    }

    // Filter by visibility
    if (query.visibility) {
      results = results.filter(p => p.visibility === query.visibility);
    }

    // Filter by minimum rating
    if (query.minRating) {
      results = results.filter(p => p.rating >= query.minRating!);
    }

    // Text search
    if (query.query) {
      const lowerQuery = query.query.toLowerCase();
      results = results.filter(p => 
        p.name.toLowerCase().includes(lowerQuery) ||
        p.description.toLowerCase().includes(lowerQuery) ||
        p.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    }

    // Sort
    const sortBy = query.sortBy || 'updated';
    const sortOrder = query.sortOrder || 'desc';
    
    results.sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortBy) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'rating':
          aVal = a.rating;
          bVal = b.rating;
          break;
        case 'usage':
          aVal = a.usageCount;
          bVal = b.usageCount;
          break;
        case 'created':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        case 'updated':
        default:
          aVal = a.updatedAt;
          bVal = b.updatedAt;
          break;
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    // Pagination
    const total = results.length;
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    const paginated = results.slice(offset, offset + limit);

    this.metrics.increment('prompt_library_search_total', 1, {
      resultsCount: total.toString(),
    });

    return {
      prompts: paginated,
      total,
      offset,
      limit,
    };
  }

  /**
   * Rate a prompt
   */
  ratePrompt(params: {
    promptId: string;
    userId: string;
    rating: number;
    review?: string;
  }): PromptRating | null {
    const prompt = this.prompts.get(params.promptId);
    if (!prompt) {
      this.logger.warn('Prompt not found', { promptId: params.promptId });
      return null;
    }

    if (params.rating < 1 || params.rating > 5) {
      this.logger.warn('Invalid rating', { rating: params.rating });
      return null;
    }

    const rating: PromptRating = {
      id: crypto.randomUUID(),
      promptId: params.promptId,
      userId: params.userId,
      rating: params.rating,
      review: params.review,
      createdAt: Date.now(),
    };

    const ratings = this.ratings.get(params.promptId) || [];
    
    // Remove existing rating from same user
    const existingIndex = ratings.findIndex(r => r.userId === params.userId);
    if (existingIndex >= 0) {
      ratings.splice(existingIndex, 1);
    }
    
    ratings.push(rating);
    this.ratings.set(params.promptId, ratings);

    // Update average rating
    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
    prompt.rating = totalRating / ratings.length;
    prompt.ratingCount = ratings.length;

    this.logger.info('Prompt rated', {
      promptId: params.promptId,
      userId: params.userId,
      rating: params.rating,
    });

    this.metrics.histogram('prompt_library_rating', params.rating, {
      promptId: params.promptId,
    });

    return rating;
  }

  /**
   * Add to favorites
   */
  addFavorite(userId: string, promptId: string): boolean {
    const prompt = this.prompts.get(promptId);
    if (!prompt) {
      return false;
    }

    let userFavorites = this.favorites.get(userId);
    if (!userFavorites) {
      userFavorites = new Set();
      this.favorites.set(userId, userFavorites);
    }

    if (!userFavorites.has(promptId)) {
      userFavorites.add(promptId);
      prompt.favoriteCount++;

      this.logger.info('Prompt favorited', { userId, promptId });

      this.metrics.increment('prompt_library_favorited_total', 1, {
        promptId,
      });
    }

    return true;
  }

  /**
   * Remove from favorites
   */
  removeFavorite(userId: string, promptId: string): boolean {
    const userFavorites = this.favorites.get(userId);
    if (!userFavorites || !userFavorites.has(promptId)) {
      return false;
    }

    userFavorites.delete(promptId);
    
    const prompt = this.prompts.get(promptId);
    if (prompt) {
      prompt.favoriteCount = Math.max(0, prompt.favoriteCount - 1);
    }

    this.logger.info('Prompt unfavorited', { userId, promptId });

    return true;
  }

  /**
   * Get user favorites
   */
  getFavorites(userId: string): Prompt[] {
    const userFavorites = this.favorites.get(userId);
    if (!userFavorites) {
      return [];
    }

    return Array.from(userFavorites)
      .map(id => this.prompts.get(id))
      .filter((p): p is Prompt => p !== undefined);
  }

  /**
   * Increment usage count
   */
  incrementUsage(promptId: string): void {
    const prompt = this.prompts.get(promptId);
    if (prompt) {
      prompt.usageCount++;
      prompt.updatedAt = Date.now();
    }
  }

  /**
   * Get popular prompts
   */
  getPopular(limit: number = 10): Prompt[] {
    return Array.from(this.prompts.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  /**
   * Get top rated prompts
   */
  getTopRated(limit: number = 10): Prompt[] {
    return Array.from(this.prompts.values())
      .filter(p => p.ratingCount > 0)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }

  /**
   * Update indexes
   */
  private updateIndexes(prompt: Prompt): void {
    // Category index
    let categorySet = this.categoryIndex.get(prompt.category);
    if (!categorySet) {
      categorySet = new Set();
      this.categoryIndex.set(prompt.category, categorySet);
    }
    categorySet.add(prompt.id);

    // Tag index
    for (const tag of prompt.tags) {
      let tagSet = this.tagIndex.get(tag);
      if (!tagSet) {
        tagSet = new Set();
        this.tagIndex.set(tag, tagSet);
      }
      tagSet.add(prompt.id);
    }

    // Author index
    let authorSet = this.authorIndex.get(prompt.author);
    if (!authorSet) {
      authorSet = new Set();
      this.authorIndex.set(prompt.author, authorSet);
    }
    authorSet.add(prompt.id);
  }

  /**
   * Remove from indexes
   */
  private removeFromIndexes(prompt: Prompt): void {
    this.categoryIndex.get(prompt.category)?.delete(prompt.id);
    
    for (const tag of prompt.tags) {
      this.tagIndex.get(tag)?.delete(prompt.id);
    }
    
    this.authorIndex.get(prompt.author)?.delete(prompt.id);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPrompts: number;
    totalCategories: number;
    totalTags: number;
    totalAuthors: number;
    averageRating: number;
    totalUsage: number;
  } {
    const prompts = Array.from(this.prompts.values());
    
    return {
      totalPrompts: prompts.length,
      totalCategories: this.categoryIndex.size,
      totalTags: this.tagIndex.size,
      totalAuthors: this.authorIndex.size,
      averageRating: prompts.reduce((sum, p) => sum + p.rating, 0) / prompts.length || 0,
      totalUsage: prompts.reduce((sum, p) => sum + p.usageCount, 0),
    };
  }
}


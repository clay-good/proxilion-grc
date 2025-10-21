/**
 * Isolation Forest for Anomaly Detection
 * Implements the Isolation Forest algorithm for detecting anomalies in high-dimensional data
 */

import { Logger } from '../utils/logger.js';

export interface IsolationTreeNode {
  splitFeature?: number;
  splitValue?: number;
  left?: IsolationTreeNode;
  right?: IsolationTreeNode;
  size?: number;
}

export interface IsolationForestConfig {
  numTrees: number;
  subsampleSize: number;
  maxDepth?: number;
  contamination: number; // Expected proportion of anomalies (0-1)
}

/**
 * Isolation Forest Anomaly Detector
 */
export class IsolationForest {
  private logger: Logger;
  private config: IsolationForestConfig;
  private trees: IsolationTreeNode[] = [];
  private threshold: number = 0;
  private trained: boolean = false;

  constructor(config: Partial<IsolationForestConfig> = {}) {
    this.logger = new Logger();
    this.config = {
      numTrees: config.numTrees || 100,
      subsampleSize: config.subsampleSize || 256,
      maxDepth: config.maxDepth,
      contamination: config.contamination || 0.1,
    };
  }

  /**
   * Train the isolation forest on normal data
   */
  train(data: number[][]): void {
    if (data.length === 0) {
      throw new Error('Training data cannot be empty');
    }

    this.logger.info('Training Isolation Forest', {
      samples: data.length,
      features: data[0].length,
      trees: this.config.numTrees,
    });

    this.trees = [];

    // Build multiple isolation trees
    for (let i = 0; i < this.config.numTrees; i++) {
      const sample = this.subsample(data, this.config.subsampleSize);
      const tree = this.buildTree(sample, 0);
      this.trees.push(tree);
    }

    // Calculate threshold based on contamination
    const scores = data.map((point) => this.score(point));
    scores.sort((a, b) => b - a); // Sort descending
    const thresholdIndex = Math.floor(scores.length * this.config.contamination);
    this.threshold = scores[thresholdIndex];

    this.trained = true;
    this.logger.info('Isolation Forest training complete', {
      threshold: this.threshold,
    });
  }

  /**
   * Predict if a data point is an anomaly
   */
  predict(point: number[]): { isAnomaly: boolean; score: number; confidence: number } {
    if (!this.trained) {
      throw new Error('Model must be trained before prediction');
    }

    const score = this.score(point);
    const isAnomaly = score > this.threshold;
    
    // Calculate confidence based on distance from threshold
    const distance = Math.abs(score - this.threshold);
    const maxDistance = Math.max(Math.abs(1 - this.threshold), Math.abs(0 - this.threshold));
    const confidence = Math.min(distance / maxDistance, 1);

    return {
      isAnomaly,
      score,
      confidence,
    };
  }

  /**
   * Calculate anomaly score for a data point
   */
  private score(point: number[]): number {
    if (this.trees.length === 0) {
      return 0;
    }

    // Average path length across all trees
    const avgPathLength = this.trees.reduce((sum, tree) => {
      return sum + this.pathLength(point, tree, 0);
    }, 0) / this.trees.length;

    // Normalize using expected path length
    const c = this.expectedPathLength(this.config.subsampleSize);
    const score = Math.pow(2, -avgPathLength / c);

    return score;
  }

  /**
   * Build an isolation tree
   */
  private buildTree(data: number[][], depth: number): IsolationTreeNode {
    const maxDepth = this.config.maxDepth || Math.ceil(Math.log2(this.config.subsampleSize));

    // Stop conditions
    if (depth >= maxDepth || data.length <= 1) {
      return { size: data.length };
    }

    // Randomly select a feature and split value
    const numFeatures = data[0].length;
    const splitFeature = Math.floor(Math.random() * numFeatures);
    
    const featureValues = data.map((point) => point[splitFeature]);
    const minValue = Math.min(...featureValues);
    const maxValue = Math.max(...featureValues);

    if (minValue === maxValue) {
      return { size: data.length };
    }

    const splitValue = minValue + Math.random() * (maxValue - minValue);

    // Split data
    const leftData = data.filter((point) => point[splitFeature] < splitValue);
    const rightData = data.filter((point) => point[splitFeature] >= splitValue);

    if (leftData.length === 0 || rightData.length === 0) {
      return { size: data.length };
    }

    return {
      splitFeature,
      splitValue,
      left: this.buildTree(leftData, depth + 1),
      right: this.buildTree(rightData, depth + 1),
    };
  }

  /**
   * Calculate path length for a data point in a tree
   */
  private pathLength(point: number[], node: IsolationTreeNode, currentDepth: number): number {
    // External node (leaf)
    if (node.splitFeature === undefined) {
      return currentDepth + this.expectedPathLength(node.size || 1);
    }

    // Internal node - traverse tree
    if (point[node.splitFeature] < node.splitValue!) {
      return this.pathLength(point, node.left!, currentDepth + 1);
    } else {
      return this.pathLength(point, node.right!, currentDepth + 1);
    }
  }

  /**
   * Expected path length for a given sample size
   */
  private expectedPathLength(n: number): number {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    
    // Harmonic number approximation
    const H = Math.log(n - 1) + 0.5772156649; // Euler's constant
    return 2 * H - (2 * (n - 1)) / n;
  }

  /**
   * Subsample data
   */
  private subsample(data: number[][], size: number): number[][] {
    if (data.length <= size) {
      return data;
    }

    const sample: number[][] = [];
    const indices = new Set<number>();

    while (indices.size < size) {
      const index = Math.floor(Math.random() * data.length);
      if (!indices.has(index)) {
        indices.add(index);
        sample.push(data[index]);
      }
    }

    return sample;
  }

  /**
   * Get model statistics
   */
  getStats(): {
    trained: boolean;
    numTrees: number;
    threshold: number;
    contamination: number;
  } {
    return {
      trained: this.trained,
      numTrees: this.trees.length,
      threshold: this.threshold,
      contamination: this.config.contamination,
    };
  }

  /**
   * Save model to JSON
   */
  toJSON(): string {
    return JSON.stringify({
      config: this.config,
      trees: this.trees,
      threshold: this.threshold,
      trained: this.trained,
    });
  }

  /**
   * Load model from JSON
   */
  static fromJSON(json: string): IsolationForest {
    const data = JSON.parse(json);
    const forest = new IsolationForest(data.config);
    forest.trees = data.trees;
    forest.threshold = data.threshold;
    forest.trained = data.trained;
    return forest;
  }
}


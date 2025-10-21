/**
 * Autoencoder for Anomaly Detection
 * 
 * A simple feedforward autoencoder neural network that learns to reconstruct
 * normal patterns. Anomalies are detected when reconstruction error is high.
 * 
 * Architecture:
 * - Input layer: n features
 * - Hidden layer 1: n/2 neurons (encoder)
 * - Bottleneck layer: n/4 neurons (latent representation)
 * - Hidden layer 2: n/2 neurons (decoder)
 * - Output layer: n features (reconstruction)
 */

import { Logger } from '../utils/logger.js';

export interface AutoencoderConfig {
  inputSize: number;
  hiddenSize?: number;
  bottleneckSize?: number;
  learningRate?: number;
  epochs?: number;
  batchSize?: number;
  threshold?: number; // Reconstruction error threshold for anomaly
}

export interface AutoencoderPrediction {
  isAnomaly: boolean;
  reconstructionError: number;
  confidence: number;
  reconstruction: number[];
}

interface Layer {
  weights: number[][];
  biases: number[];
}

export class Autoencoder {
  private config: Required<AutoencoderConfig>;
  private logger: Logger;
  private encoder1: Layer | null = null;
  private bottleneck: Layer | null = null;
  private decoder1: Layer | null = null;
  private output: Layer | null = null;
  private trained: boolean = false;
  private meanError: number = 0;
  private stdError: number = 1;

  constructor(config: AutoencoderConfig) {
    this.logger = new Logger();
    this.config = {
      inputSize: config.inputSize,
      hiddenSize: config.hiddenSize || Math.floor(config.inputSize / 2),
      bottleneckSize: config.bottleneckSize || Math.floor(config.inputSize / 4),
      learningRate: config.learningRate || 0.01,
      epochs: config.epochs || 100,
      batchSize: config.batchSize || 32,
      threshold: config.threshold || 2.0, // 2 standard deviations
    };
  }

  /**
   * Train the autoencoder on normal data
   */
  train(data: number[][]): void {
    if (data.length === 0) {
      throw new Error('Training data cannot be empty');
    }

    if (data[0].length !== this.config.inputSize) {
      throw new Error(`Input size mismatch: expected ${this.config.inputSize}, got ${data[0].length}`);
    }

    this.logger.info('Training autoencoder', {
      samples: data.length,
      inputSize: this.config.inputSize,
      epochs: this.config.epochs,
    });

    // Initialize network layers
    this.initializeLayers();

    // Normalize data
    const normalizedData = this.normalizeData(data);

    // Training loop
    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      let totalLoss = 0;

      // Shuffle data
      const shuffled = this.shuffleData(normalizedData);

      // Mini-batch training
      for (let i = 0; i < shuffled.length; i += this.config.batchSize) {
        const batch = shuffled.slice(i, i + this.config.batchSize);
        
        for (const sample of batch) {
          // Forward pass
          const reconstruction = this.forward(sample);
          
          // Calculate loss (MSE)
          const loss = this.calculateMSE(sample, reconstruction);
          totalLoss += loss;
          
          // Backward pass
          this.backward(sample, reconstruction);
        }
      }

      const avgLoss = totalLoss / shuffled.length;
      
      if (epoch % 10 === 0) {
        this.logger.info(`Epoch ${epoch}/${this.config.epochs}, Loss: ${avgLoss.toFixed(6)}`);
      }
    }

    // Calculate error statistics on training data
    this.calculateErrorStatistics(normalizedData);

    this.trained = true;
    this.logger.info('Autoencoder training complete', {
      meanError: this.meanError,
      stdError: this.stdError,
      threshold: this.config.threshold,
    });
  }

  /**
   * Predict if a data point is an anomaly
   */
  predict(point: number[]): AutoencoderPrediction {
    if (!this.trained) {
      throw new Error('Autoencoder must be trained before prediction');
    }

    if (point.length !== this.config.inputSize) {
      throw new Error(`Input size mismatch: expected ${this.config.inputSize}, got ${point.length}`);
    }

    // Normalize input
    const normalized = this.normalizePoint(point);

    // Forward pass
    const reconstruction = this.forward(normalized);

    // Calculate reconstruction error
    const error = this.calculateMSE(normalized, reconstruction);

    // Normalize error using training statistics
    const normalizedError = (error - this.meanError) / this.stdError;

    // Determine if anomaly
    const isAnomaly = normalizedError > this.config.threshold;

    // Calculate confidence (how far from threshold)
    const confidence = Math.min(1.0, Math.abs(normalizedError) / this.config.threshold);

    return {
      isAnomaly,
      reconstructionError: error,
      confidence,
      reconstruction: this.denormalizePoint(reconstruction),
    };
  }

  /**
   * Initialize network layers with random weights
   */
  private initializeLayers(): void {
    this.encoder1 = this.createLayer(this.config.inputSize, this.config.hiddenSize);
    this.bottleneck = this.createLayer(this.config.hiddenSize, this.config.bottleneckSize);
    this.decoder1 = this.createLayer(this.config.bottleneckSize, this.config.hiddenSize);
    this.output = this.createLayer(this.config.hiddenSize, this.config.inputSize);
  }

  /**
   * Create a layer with random weights
   */
  private createLayer(inputSize: number, outputSize: number): Layer {
    const weights: number[][] = [];
    const biases: number[] = [];

    // Xavier initialization
    const scale = Math.sqrt(2.0 / (inputSize + outputSize));

    for (let i = 0; i < outputSize; i++) {
      weights[i] = [];
      for (let j = 0; j < inputSize; j++) {
        weights[i][j] = (Math.random() * 2 - 1) * scale;
      }
      biases[i] = 0;
    }

    return { weights, biases };
  }

  /**
   * Forward pass through the network
   */
  private forward(input: number[]): number[] {
    // Encoder
    let hidden1 = this.layerForward(input, this.encoder1!);
    hidden1 = this.relu(hidden1);

    let bottleneck = this.layerForward(hidden1, this.bottleneck!);
    bottleneck = this.relu(bottleneck);

    // Decoder
    let hidden2 = this.layerForward(bottleneck, this.decoder1!);
    hidden2 = this.relu(hidden2);

    const output = this.layerForward(hidden2, this.output!);
    
    return output;
  }

  /**
   * Forward pass through a single layer
   */
  private layerForward(input: number[], layer: Layer): number[] {
    const output: number[] = [];
    
    for (let i = 0; i < layer.weights.length; i++) {
      let sum = layer.biases[i];
      for (let j = 0; j < input.length; j++) {
        sum += input[j] * layer.weights[i][j];
      }
      output[i] = sum;
    }
    
    return output;
  }

  /**
   * ReLU activation function
   */
  private relu(x: number[]): number[] {
    return x.map(val => Math.max(0, val));
  }

  /**
   * Backward pass (simplified gradient descent)
   */
  private backward(input: number[], reconstruction: number[]): void {
    // Calculate output error
    const outputError = input.map((val, i) => val - reconstruction[i]);

    // Update output layer (simplified)
    this.updateLayer(this.output!, outputError, this.config.learningRate);
  }

  /**
   * Update layer weights
   */
  private updateLayer(layer: Layer, error: number[], learningRate: number): void {
    for (let i = 0; i < layer.weights.length; i++) {
      for (let j = 0; j < layer.weights[i].length; j++) {
        layer.weights[i][j] += learningRate * error[i];
      }
      layer.biases[i] += learningRate * error[i];
    }
  }

  /**
   * Calculate Mean Squared Error
   */
  private calculateMSE(actual: number[], predicted: number[]): number {
    let sum = 0;
    for (let i = 0; i < actual.length; i++) {
      const diff = actual[i] - predicted[i];
      sum += diff * diff;
    }
    return sum / actual.length;
  }

  /**
   * Calculate error statistics on training data
   */
  private calculateErrorStatistics(data: number[][]): void {
    const errors: number[] = [];
    
    for (const sample of data) {
      const reconstruction = this.forward(sample);
      const error = this.calculateMSE(sample, reconstruction);
      errors.push(error);
    }

    // Calculate mean and standard deviation
    this.meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
    
    const variance = errors.reduce((sum, error) => {
      const diff = error - this.meanError;
      return sum + diff * diff;
    }, 0) / errors.length;
    
    this.stdError = Math.sqrt(variance);
  }

  /**
   * Normalize data to [0, 1] range
   */
  private normalizeData(data: number[][]): number[][] {
    return data.map(point => this.normalizePoint(point));
  }

  /**
   * Normalize a single point
   */
  private normalizePoint(point: number[]): number[] {
    // Simple min-max normalization (could be improved with stored min/max)
    return point.map(val => Math.max(0, Math.min(1, val / 100)));
  }

  /**
   * Denormalize a point back to original scale
   */
  private denormalizePoint(point: number[]): number[] {
    return point.map(val => val * 100);
  }

  /**
   * Shuffle data array
   */
  private shuffleData(data: number[][]): number[][] {
    const shuffled = [...data];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Serialize model to JSON
   */
  toJSON(): string {
    return JSON.stringify({
      config: this.config,
      encoder1: this.encoder1,
      bottleneck: this.bottleneck,
      decoder1: this.decoder1,
      output: this.output,
      trained: this.trained,
      meanError: this.meanError,
      stdError: this.stdError,
    });
  }

  /**
   * Deserialize model from JSON
   */
  static fromJSON(json: string): Autoencoder {
    const data = JSON.parse(json);
    const autoencoder = new Autoencoder(data.config);
    autoencoder.encoder1 = data.encoder1;
    autoencoder.bottleneck = data.bottleneck;
    autoencoder.decoder1 = data.decoder1;
    autoencoder.output = data.output;
    autoencoder.trained = data.trained;
    autoencoder.meanError = data.meanError;
    autoencoder.stdError = data.stdError;
    return autoencoder;
  }
}


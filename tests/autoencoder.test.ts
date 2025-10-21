/**
 * Autoencoder Tests
 */

import { describe, it, expect } from 'vitest';
import { Autoencoder } from '../src/ml/autoencoder.js';

describe('Autoencoder', () => {
  describe('Training', () => {
    it('should train on normal data', () => {
      const autoencoder = new Autoencoder({
        inputSize: 4,
        hiddenSize: 2,
        bottleneckSize: 1,
        epochs: 10,
        batchSize: 4,
      });

      // Generate normal data (small variations around [10, 20, 30, 40])
      const trainingData: number[][] = [];
      for (let i = 0; i < 100; i++) {
        trainingData.push([
          10 + Math.random() * 2,
          20 + Math.random() * 2,
          30 + Math.random() * 2,
          40 + Math.random() * 2,
        ]);
      }

      expect(() => autoencoder.train(trainingData)).not.toThrow();
    });

    it('should throw error on empty training data', () => {
      const autoencoder = new Autoencoder({
        inputSize: 4,
      });

      expect(() => autoencoder.train([])).toThrow('Training data cannot be empty');
    });

    it('should throw error on input size mismatch', () => {
      const autoencoder = new Autoencoder({
        inputSize: 4,
      });

      const trainingData = [[1, 2, 3]]; // Wrong size

      expect(() => autoencoder.train(trainingData)).toThrow('Input size mismatch');
    });
  });

  describe('Prediction', () => {
    it('should detect normal patterns', () => {
      const autoencoder = new Autoencoder({
        inputSize: 4,
        hiddenSize: 2,
        bottleneckSize: 1,
        epochs: 20,
        batchSize: 4,
        threshold: 2.0,
      });

      // Train on normal data
      const trainingData: number[][] = [];
      for (let i = 0; i < 100; i++) {
        trainingData.push([
          10 + Math.random() * 2,
          20 + Math.random() * 2,
          30 + Math.random() * 2,
          40 + Math.random() * 2,
        ]);
      }
      autoencoder.train(trainingData);

      // Test with normal data
      const normalPoint = [10.5, 20.5, 30.5, 40.5];
      const prediction = autoencoder.predict(normalPoint);

      expect(prediction.isAnomaly).toBe(false);
      expect(prediction.reconstructionError).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction.reconstruction).toHaveLength(4);
    });

    it('should detect anomalies', () => {
      const autoencoder = new Autoencoder({
        inputSize: 4,
        hiddenSize: 2,
        bottleneckSize: 1,
        epochs: 20,
        batchSize: 4,
        threshold: 1.5, // Lower threshold for easier anomaly detection
      });

      // Train on normal data
      const trainingData: number[][] = [];
      for (let i = 0; i < 100; i++) {
        trainingData.push([
          10 + Math.random() * 2,
          20 + Math.random() * 2,
          30 + Math.random() * 2,
          40 + Math.random() * 2,
        ]);
      }
      autoencoder.train(trainingData);

      // Test with anomalous data (very different from training)
      const anomalousPoint = [100, 200, 300, 400];
      const prediction = autoencoder.predict(anomalousPoint);

      expect(prediction.isAnomaly).toBe(true);
      expect(prediction.reconstructionError).toBeGreaterThan(0);
      expect(prediction.confidence).toBeGreaterThan(0);
    });

    it('should throw error when predicting before training', () => {
      const autoencoder = new Autoencoder({
        inputSize: 4,
      });

      expect(() => autoencoder.predict([1, 2, 3, 4])).toThrow(
        'Autoencoder must be trained before prediction'
      );
    });

    it('should throw error on prediction input size mismatch', () => {
      const autoencoder = new Autoencoder({
        inputSize: 4,
        epochs: 5,
      });

      const trainingData = [[1, 2, 3, 4], [2, 3, 4, 5]];
      autoencoder.train(trainingData);

      expect(() => autoencoder.predict([1, 2, 3])).toThrow('Input size mismatch');
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize model', () => {
      const autoencoder = new Autoencoder({
        inputSize: 4,
        hiddenSize: 2,
        bottleneckSize: 1,
        epochs: 10,
        batchSize: 4,
      });

      // Train model
      const trainingData: number[][] = [];
      for (let i = 0; i < 50; i++) {
        trainingData.push([
          10 + Math.random() * 2,
          20 + Math.random() * 2,
          30 + Math.random() * 2,
          40 + Math.random() * 2,
        ]);
      }
      autoencoder.train(trainingData);

      // Serialize
      const json = autoencoder.toJSON();
      expect(json).toBeDefined();
      expect(typeof json).toBe('string');

      // Deserialize
      const restored = Autoencoder.fromJSON(json);
      expect(restored).toBeDefined();

      // Test that restored model works
      const testPoint = [10.5, 20.5, 30.5, 40.5];
      const prediction = restored.predict(testPoint);
      expect(prediction).toBeDefined();
      expect(prediction.reconstruction).toHaveLength(4);
    });
  });

  describe('Configuration', () => {
    it('should use default configuration values', () => {
      const autoencoder = new Autoencoder({
        inputSize: 8,
      });

      // Train with minimal data to verify defaults work
      const trainingData: number[][] = [];
      for (let i = 0; i < 10; i++) {
        trainingData.push(Array(8).fill(0).map(() => Math.random() * 10));
      }

      expect(() => autoencoder.train(trainingData)).not.toThrow();
    });

    it('should use custom configuration values', () => {
      const autoencoder = new Autoencoder({
        inputSize: 8,
        hiddenSize: 6,
        bottleneckSize: 3,
        learningRate: 0.001,
        epochs: 5,
        batchSize: 8,
        threshold: 3.0,
      });

      const trainingData: number[][] = [];
      for (let i = 0; i < 10; i++) {
        trainingData.push(Array(8).fill(0).map(() => Math.random() * 10));
      }

      expect(() => autoencoder.train(trainingData)).not.toThrow();
    });
  });

  describe('Reconstruction Quality', () => {
    it('should have low reconstruction error for training data', () => {
      const autoencoder = new Autoencoder({
        inputSize: 4,
        hiddenSize: 3,
        bottleneckSize: 2,
        epochs: 50,
        batchSize: 10,
      });

      // Train on simple pattern
      const trainingData: number[][] = [];
      for (let i = 0; i < 100; i++) {
        trainingData.push([10, 20, 30, 40]);
      }
      autoencoder.train(trainingData);

      // Test reconstruction on training pattern
      const prediction = autoencoder.predict([10, 20, 30, 40]);
      
      // Reconstruction error should be relatively low for training data
      expect(prediction.reconstructionError).toBeLessThan(10);
    });

    it('should have high reconstruction error for anomalous data', () => {
      const autoencoder = new Autoencoder({
        inputSize: 4,
        hiddenSize: 3,
        bottleneckSize: 2,
        epochs: 30,
        batchSize: 10,
      });

      // Train on pattern around [10, 20, 30, 40]
      const trainingData: number[][] = [];
      for (let i = 0; i < 100; i++) {
        trainingData.push([
          10 + Math.random(),
          20 + Math.random(),
          30 + Math.random(),
          40 + Math.random(),
        ]);
      }
      autoencoder.train(trainingData);

      // Test with very different pattern
      const normalPrediction = autoencoder.predict([10.5, 20.5, 30.5, 40.5]);
      const anomalousPrediction = autoencoder.predict([50, 60, 70, 80]);

      // Anomalous data should have higher reconstruction error
      expect(anomalousPrediction.reconstructionError).toBeGreaterThan(
        normalPrediction.reconstructionError
      );
    });
  });
});


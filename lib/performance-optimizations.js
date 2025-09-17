/**
 * Performance optimization utilities for XCUITest driver
 * @fileoverview Contains performance-related optimizations and caching strategies
 */

import {LRUCache} from 'lru-cache';
import _ from 'lodash';
import B from 'bluebird';

/**
 * Enhanced cache for frequently accessed data
 */
export class PerformanceCache {
  constructor(options = {}) {
    this.deviceInfoCache = new LRUCache({
      max: options.deviceInfoMax || 50,
      ttl: options.deviceInfoTtl || 5 * 60 * 1000, // 5 minutes
    });

    this.xcodeVersionCache = new LRUCache({
      max: options.xcodeVersionMax || 10,
      ttl: options.xcodeVersionTtl || 10 * 60 * 1000, // 10 minutes
    });

    this.simulatorCache = new LRUCache({
      max: options.simulatorMax || 100,
      ttl: options.simulatorTtl || 2 * 60 * 1000, // 2 minutes
    });
  }

  /**
   * Get cached device info
   * @param {string} key - Cache key
   * @returns {any} Cached device info or undefined
   */
  getDeviceInfo(key) {
    return this.deviceInfoCache.get(key);
  }

  /**
   * Set device info in cache
   * @param {string} key - Cache key
   * @param {any} value - Device info to cache
   */
  setDeviceInfo(key, value) {
    this.deviceInfoCache.set(key, value);
  }

  /**
   * Get cached Xcode version
   * @param {string} key - Cache key
   * @returns {any} Cached Xcode version or undefined
   */
  getXcodeVersion(key) {
    return this.xcodeVersionCache.get(key);
  }

  /**
   * Set Xcode version in cache
   * @param {string} key - Cache key
   * @param {any} value - Xcode version to cache
   */
  setXcodeVersion(key, value) {
    this.xcodeVersionCache.set(key, value);
  }

  /**
   * Get cached simulator info
   * @param {string} key - Cache key
   * @returns {any} Cached simulator info or undefined
   */
  getSimulator(key) {
    return this.simulatorCache.get(key);
  }

  /**
   * Set simulator info in cache
   * @param {string} key - Cache key
   * @param {any} value - Simulator info to cache
   */
  setSimulator(key, value) {
    this.simulatorCache.set(key, value);
  }

  /**
   * Clear all caches
   */
  clear() {
    this.deviceInfoCache.clear();
    this.xcodeVersionCache.clear();
    this.simulatorCache.clear();
  }
}

/**
 * Debounced function creator for expensive operations
 * @param {(...args: any[]) => any} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {(...args: any[]) => any} Debounced function
 */
export function createDebouncedFunction(fn, delay = 300) {
  return _.debounce(fn, delay, {
    leading: true,
    trailing: false,
  });
}

/**
 * Throttled function creator for rate-limited operations
 * @param {(...args: any[]) => any} fn - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {(...args: any[]) => any} Throttled function
 */
export function createThrottledFunction(fn, delay = 100) {
  return _.throttle(fn, delay, {
    leading: true,
    trailing: true,
  });
}

/**
 * Parallel execution helper with concurrency control
 * @param {Array} items - Items to process
 * @param {(item: any, index: number, arrayLength: number) => any} processor - Function to process each item
 * @param {number} concurrency - Maximum concurrent operations
 * @returns {Promise<Array>} Results of all operations
 */
export async function parallelWithConcurrency(items, processor, concurrency = 5) {
  return B.map(items, processor, {concurrency});
}

/**
 * Retry mechanism with exponential backoff
 * @param {() => Promise<any>} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise<any>} Result of the function
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await B.delay(delay);
    }
  }

  throw lastError;
}

/**
 * Memory usage monitor
 */
export class MemoryMonitor {
  constructor() {
    this.initialMemory = process.memoryUsage();
    this.peakMemory = this.initialMemory;
  }

  /**
   * Get current memory usage
   * @returns {Object} Memory usage statistics
   */
  getMemoryUsage() {
    const current = process.memoryUsage();
    this.peakMemory = {
      rss: Math.max(this.peakMemory.rss, current.rss),
      heapTotal: Math.max(this.peakMemory.heapTotal, current.heapTotal),
      heapUsed: Math.max(this.peakMemory.heapUsed, current.heapUsed),
      external: Math.max(this.peakMemory.external, current.external),
      arrayBuffers: Math.max(this.peakMemory.arrayBuffers || 0, current.arrayBuffers || 0),
    };

    return {
      current,
      peak: this.peakMemory,
      delta: {
        rss: current.rss - this.initialMemory.rss,
        heapTotal: current.heapTotal - this.initialMemory.heapTotal,
        heapUsed: current.heapUsed - this.initialMemory.heapUsed,
        external: current.external - this.initialMemory.external,
        arrayBuffers: (current.arrayBuffers || 0) - (this.initialMemory.arrayBuffers || 0),
      },
    };
  }

  /**
   * Force garbage collection if available
   */
  forceGC() {
    if (global.gc) {
      global.gc();
    }
  }
}

/**
 * Performance timing utilities
 */
export class PerformanceTimer {
  constructor() {
    this.timers = new Map();
  }

  /**
   * Start a timer
   * @param {string} name - Timer name
   */
  start(name) {
    this.timers.set(name, {
      start: process.hrtime.bigint(),
      end: null,
    });
  }

  /**
   * End a timer
   * @param {string} name - Timer name
   * @returns {number} Duration in milliseconds
   */
  end(name) {
    const timer = this.timers.get(name);
    if (!timer) {
      throw new Error(`Timer '${name}' not found`);
    }

    timer.end = process.hrtime.bigint();
    const duration = Number(timer.end - timer.start) / 1000000; // Convert to milliseconds
    return duration;
  }

  /**
   * Get timer duration without ending it
   * @param {string} name - Timer name
   * @returns {number} Duration in milliseconds
   */
  getDuration(name) {
    const timer = this.timers.get(name);
    if (!timer) {
      throw new Error(`Timer '${name}' not found`);
    }

    const end = timer.end || process.hrtime.bigint();
    return Number(end - timer.start) / 1000000;
  }

  /**
   * Clear all timers
   */
  clear() {
    this.timers.clear();
  }
}

/**
 * Singleton instance for global performance monitoring
 */
export const globalPerformanceCache = new PerformanceCache();
export const globalMemoryMonitor = new MemoryMonitor();
export const globalPerformanceTimer = new PerformanceTimer();

import type { AITourConfig, FetchTourResponse } from './types';
import { logger } from '../utils/logger';
import { VERSION } from '../version';

type GenerationResult = { regenerated: boolean; pending?: boolean };

export class ApiClient {
  public config: AITourConfig;
  public readonly baseUrl: string;
  private isGenerating: boolean = false;
  private fetchAbortController: AbortController | null = null;

  constructor(config: AITourConfig) {
    this.config  = config;
    this.baseUrl = (config.apiUrl || 'https://aitour-api.vishalkumar-9ca.workers.dev/api/v1')
      .replace(/\/$/, '');
  }

  public async fetchTour(): Promise<FetchTourResponse | null> {
    if (this.fetchAbortController) this.fetchAbortController.abort();
    this.fetchAbortController = new AbortController();

    const maxAttempts = 3;
    const initialDelay = 300;

    const params = new URLSearchParams({
      contextKey: this.config.contextKey!,
      userId:     this.config.userId,
      ...(this.config.uiVersion ? { uiVersion: this.config.uiVersion } : {})
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/tours/active?${params}`, {
          method:  'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'X-AITour-SDK-Version': VERSION
          },
          signal:  this.fetchAbortController.signal
        });

        if (!response.ok) {
          // If status is a client error other than 429, don't retry.
          if (response.status < 500 && response.status !== 429 && attempt < maxAttempts) {
            throw new Error(`HTTP ${response.status}`);
          }
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
      } catch (error: any) {
        if (error?.name === 'AbortError') return null;

        // Don't retry non-transient client errors
        if (error.message && error.message.startsWith('HTTP ') && !error.message.startsWith('HTTP 5') && !error.message.includes('429')) {
          logger.warn('Failed to fetch tour due to client error:', error);
          return null;
        }

        if (attempt === maxAttempts) {
          logger.warn(`Failed to fetch tour after ${maxAttempts} attempts:`, error);
          return null;
        }

        const delay = initialDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return null;
  }

  public async requestTourGeneration(
    contextKey: string,
    elements: any[]
  ): Promise<GenerationResult | false> {

    if (this.isGenerating) {
      logger.info(`Generation already in progress for "${contextKey}". Skipping.`);
      return false;
    }

    this.isGenerating = true;
    try {
      const response = await fetch(`${this.baseUrl}/tours/generate-sdk`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-AITour-SDK-Version': VERSION
        },
        body: JSON.stringify({ contextKey, domSchema: elements, uiVersion: this.config.uiVersion })
      });

      if (!response.ok) {
        logger.warn('Tour generation request failed:', response.status);
        return false;
      }

      const result = (await response.json()) as any;

      if (result.pending) {
        logger.info(`Generation pending for "${contextKey}" — another request in flight.`);
        return { regenerated: false, pending: true };
      }

      if (result.regenerated === false) {
        logger.info(`UI unchanged for "${contextKey}". Existing tour is current.`);
        return { regenerated: false };
      }

      logger.info(`Tour generated for "${contextKey}" (${result.stepsCount} steps).`);
      return { regenerated: true };

    } catch (error: any) {
      logger.error('[GENERATE SDK ERROR]', error, error?.stack);
      return false;
    } finally {
      this.isGenerating = false;
    }
  }

  public async recordProgress(
    tourId: string,
    status: 'started' | 'completed' | 'dismissed' | 'maybe_later',
    step?: number
  ): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/tours/progress`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type':  'application/json',
          'X-AITour-SDK-Version': VERSION
        },
        body: JSON.stringify({
          userId: this.config.userId,
          tourId,
          status,
          ...(step !== undefined ? { step } : {}),
        })
      });
    } catch {
      // Fail silently
    }
  }
}
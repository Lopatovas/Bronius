import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createProviders,
  loadConfigFromEnv,
  resetProviders,
  type ProviderConfig,
} from '@/core/modules/provider-registry';
import { OpenAIBrainAdapter } from '@/adapters/openai-brain.adapter';
import { MistralBrainAdapter } from '@/adapters/mistral-brain.adapter';
import { MockBrainAdapter } from '@/adapters/mock-brain.adapter';
import { resetContainer } from '@/lib/container';

describe('provider-registry', () => {
  beforeEach(() => {
    resetProviders();
    resetContainer();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    resetProviders();
    resetContainer();
    vi.unstubAllEnvs();
  });

  it('loadConfigFromEnv reads brain, limits, and optional keys', () => {
    vi.stubEnv('BRAIN_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'sk-x');
    vi.stubEnv('MAX_TURNS', '7');
    vi.stubEnv('MAX_CALL_DURATION_SEC', '120');
    vi.stubEnv('MAX_SILENCE_RETRIES', '1');
    vi.stubEnv('MISTRAL_MODEL', 'mistral-large-latest');

    const c = loadConfigFromEnv();
    expect(c.brainProvider).toBe('openai');
    expect(c.openaiApiKey).toBe('sk-x');
    expect(c.maxTurns).toBe(7);
    expect(c.maxCallDurationSec).toBe(120);
    expect(c.maxSilenceRetries).toBe(1);
    expect(c.mistralModel).toBe('mistral-large-latest');
  });

  it('defaults brain to mock and numeric limits when env unset', () => {
    const c = loadConfigFromEnv();
    expect(c.brainProvider).toBe('mock');
    expect(c.maxTurns).toBe(10);
    expect(c.maxCallDurationSec).toBe(300);
    expect(c.maxSilenceRetries).toBe(2);
  });

  it('createProviders uses OpenAIBrainAdapter when openai + key', async () => {
    const config: ProviderConfig = {
      brainProvider: 'openai',
      openaiApiKey: 'sk-test',
      maxTurns: 10,
      maxCallDurationSec: 300,
      maxSilenceRetries: 2,
    };
    const p = await createProviders(config);
    expect(p.brain).toBeInstanceOf(OpenAIBrainAdapter);
  });

  it('createProviders uses MistralBrainAdapter when mistral + key', async () => {
    const config: ProviderConfig = {
      brainProvider: 'mistral',
      mistralApiKey: 'mistral-test',
      mistralModel: 'mistral-small-latest',
      maxTurns: 10,
      maxCallDurationSec: 300,
      maxSilenceRetries: 2,
    };
    const p = await createProviders(config);
    expect(p.brain).toBeInstanceOf(MistralBrainAdapter);
  });

  it('createProviders falls back to MockBrainAdapter when openai selected without key', async () => {
    const config: ProviderConfig = {
      brainProvider: 'openai',
      openaiApiKey: undefined,
      maxTurns: 10,
      maxCallDurationSec: 300,
      maxSilenceRetries: 2,
    };
    const p = await createProviders(config);
    expect(p.brain).toBeInstanceOf(MockBrainAdapter);
  });

  it('createProviders falls back to MockBrainAdapter when mistral selected without key', async () => {
    const config: ProviderConfig = {
      brainProvider: 'mistral',
      mistralApiKey: undefined,
      maxTurns: 10,
      maxCallDurationSec: 300,
      maxSilenceRetries: 2,
    };
    const p = await createProviders(config);
    expect(p.brain).toBeInstanceOf(MockBrainAdapter);
  });

  it('returns the same cached providers on repeated createProviders calls', async () => {
    const config: ProviderConfig = {
      brainProvider: 'mock',
      maxTurns: 10,
      maxCallDurationSec: 300,
      maxSilenceRetries: 2,
    };
    const a = await createProviders(config);
    const b = await createProviders(config);
    expect(a).toBe(b);
    expect(a.telephony).toBe(b.telephony);
  });
});

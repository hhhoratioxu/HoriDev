import { describe, expect, it, vi, afterEach } from 'vitest';
import { openAIProvider } from '../worker/services/openai';
import type { Env } from '../worker/types';
import { demoAnalysis } from '../worker/services/demo';
const env = { OPENAI_API_KEY: 'sk-fake-unit-test', OPENAI_TIMEOUT_MS: '2000' } as Env;
function response(events: unknown[]) {
  return new Response(
    events.map((data) => `data: ${JSON.stringify(data)}\n\n`).join('') + 'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream', 'x-request-id': 'req-test' } },
  );
}
afterEach(() => vi.unstubAllGlobals());
describe('official Responses SDK with mock transport: no external calls', () => {
  it('sends structured schema server-side and records official completed usage', async () => {
    let input: Record<string, unknown> = {};
    const fetcher = vi.fn(async (_url: unknown, options: RequestInit) => {
      input = JSON.parse(String(options.body)) as Record<string, unknown>;
      return response([
        { type: 'response.output_text.delta', delta: JSON.stringify(demoAnalysis) },
        {
          type: 'response.completed',
          response: {
            id: 'resp-test',
            status: 'completed',
            usage: {
              input_tokens: 120,
              output_tokens: 80,
              input_tokens_details: { cached_tokens: 10 },
            },
          },
        },
      ]);
    });
    vi.stubGlobal('fetch', fetcher);
    const recorded = vi.fn(async () => {});
    const delta = vi.fn(async () => {});
    const result = await openAIProvider(env).run(
      'analyze',
      'test requirement',
      'gpt-6-luna',
      3000,
      new AbortController().signal,
      delta,
      recorded,
    );
    expect(result.usage).toEqual({ input: 120, cached: 10, output: 80 });
    expect(recorded).toHaveBeenCalledWith(result.usage, 'resp-test');
    expect(input).toMatchObject({
      model: 'gpt-6-luna',
      store: false,
      stream: true,
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect(input).not.toHaveProperty('tools');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects truncated responses while preserving known usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response([
          {
            type: 'response.incomplete',
            response: {
              id: 'resp-incomplete',
              status: 'incomplete',
              usage: {
                input_tokens: 100,
                output_tokens: 3000,
                input_tokens_details: { cached_tokens: 0 },
              },
            },
          },
        ]),
      ),
    );
    const record = vi.fn(async () => {});
    await expect(
      openAIProvider(env).run(
        'analyze',
        'requirement',
        'gpt-6-luna',
        3000,
        new AbortController().signal,
        async () => {},
        record,
      ),
    ).rejects.toMatchObject({ code: 'AI_INCOMPLETE' });
    expect(record).toHaveBeenCalledOnce();
  });
  it('rejects missing official usage and malformed JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response([
          { type: 'response.completed', response: { id: 'resp-no-usage', status: 'completed' } },
        ]),
      ),
    );
    await expect(
      openAIProvider(env).run(
        'analyze',
        'requirement',
        'gpt-6-luna',
        3000,
        new AbortController().signal,
        async () => {},
        async () => {},
      ),
    ).rejects.toMatchObject({ code: 'AI_USAGE_MISSING' });
  });
  it('retries explicit rate rejection once and stops', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: 'rate limit', type: 'rate_limit_error' } }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      openAIProvider(env).run(
        'analyze',
        'requirement',
        'gpt-6-luna',
        3000,
        new AbortController().signal,
        async () => {},
        async () => {},
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not retry unsupported structure parameters', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: 'unsupported format', type: 'invalid_request_error' },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      openAIProvider(env).run(
        'analyze',
        'requirement',
        'unsupported-model',
        3000,
        new AbortController().signal,
        async () => {},
        async () => {},
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

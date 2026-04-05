import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getProviders } from '@/lib/container';
import { loadConfigFromEnv } from '@/core/modules/provider-registry';
import { generateId } from '@/lib/id';
import type { ConversationContext } from '@/core/domain/types';

const bodySchema = z.object({
  message: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const text = parsed.data.message?.trim() || 'Hello from the Bronius debug panel.';
    const config = loadConfigFromEnv();
    const providers = await getProviders();
    const pingId = `debug-brain-${generateId()}`;

    const context: ConversationContext = {
      callSessionId: pingId,
      turns: [
        {
          id: 't0',
          callSessionId: pingId,
          turnIndex: 0,
          speaker: 'human',
          text,
          createdAt: new Date(),
        },
      ],
      turnCount: 1,
      maxTurns: config.maxTurns,
    };

    const reply = await providers.brain.generateReply(context);

    return NextResponse.json({
      ok: true,
      brainProvider: config.brainProvider,
      reply,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

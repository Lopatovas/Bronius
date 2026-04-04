import { createHmac } from 'crypto';
import { TelephonyPort, PlaceCallParams, PlaceCallResult, VoiceAction } from '../core/ports/telephony.port';
import { NormalizedProviderEvent } from '../core/domain/events';
import { pushIntegrationTrace } from '../lib/integration-trace';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildTwiml(actions: VoiceAction[]): string {
  let body = '';
  for (const action of actions) {
    switch (action.type) {
      case 'say':
        body += `<Say voice="${action.voice || 'Polly.Amy'}">${escapeXml(action.text || '')}</Say>`;
        break;
      case 'gather': {
        const opts = action.gatherOptions;
        if (opts) {
          const actionOnEmpty = opts.actionOnEmptyResult ? ' actionOnEmptyResult="true"' : '';
          body += `<Gather input="${opts.input}" speechTimeout="${opts.speechTimeout || 'auto'}" timeout="${opts.timeout || 5}" action="${escapeXml(opts.actionPath)}" method="POST"${actionOnEmpty}/>`;
        }
        break;
      }
      case 'hangup':
        body += `<Hangup/>`;
        break;
      case 'pause':
        body += `<Pause length="${action.length || 1}"/>`;
        break;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

export class TwilioTelephonyAdapter implements TelephonyPort {
  constructor(
    private accountSid: string,
    private apiKey: string,
    private apiSecret: string,
  ) {}

  private assertConfigured(): void {
    if (!this.accountSid || !this.apiKey || !this.apiSecret) {
      throw new Error(
        'Twilio credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_API_KEY, and TWILIO_API_SECRET environment variables.',
      );
    }
  }

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');
  }

  async placeCall(params: PlaceCallParams): Promise<PlaceCallResult> {
    this.assertConfigured();

    if (!params.fromNumber) {
      throw new Error(
        'Twilio phone number not configured. Set TWILIO_PHONE_NUMBER environment variable.',
      );
    }
    if (!params.webhookBaseUrl) {
      throw new Error(
        'Webhook base URL could not be determined from the request.',
      );
    }

    const voiceUrl = `${params.webhookBaseUrl}/api/v1/telephony/voice?callSessionId=${params.callSessionId}`;
    const statusUrl = `${params.webhookBaseUrl}/api/v1/telephony/events?callSessionId=${params.callSessionId}`;

    const body = new URLSearchParams();
    body.append('To', params.toNumber);
    body.append('From', params.fromNumber);
    body.append('Url', voiceUrl);
    body.append('Method', 'POST');
    body.append('StatusCallback', statusUrl);
    body.append('StatusCallbackMethod', 'POST');
    body.append('StatusCallbackEvent', 'initiated');
    body.append('StatusCallbackEvent', 'ringing');
    body.append('StatusCallbackEvent', 'answered');
    body.append('StatusCallbackEvent', 'completed');

    const url = `${TWILIO_API_BASE}/Accounts/${this.accountSid}/Calls.json`;
    const bodyStr = body.toString();

    pushIntegrationTrace({
      kind: 'twilio_rest',
      label: 'Twilio REST → POST Calls.json (place call)',
      callSessionId: params.callSessionId,
      meta: {
        url,
        method: 'POST',
        form: Object.fromEntries(body),
      },
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyStr,
    });

    const json = await res.json() as Record<string, unknown>;

    pushIntegrationTrace({
      kind: 'twilio_rest',
      label: 'Twilio REST ← Calls.json response',
      callSessionId: params.callSessionId,
      meta: {
        httpStatus: res.status,
        sid: json.sid,
        status: json.status,
        errorCode: json.code,
        message: json.message,
        error: json.error,
      },
    });

    if (!res.ok) {
      throw new Error(
        `Twilio API error: ${json.message || res.statusText}` +
        (json.code ? ` (code: ${json.code})` : '') +
        ` (HTTP ${res.status})` +
        (json.more_info ? ` — see ${json.more_info}` : ''),
      );
    }

    return { providerCallId: json.sid as string };
  }

  async hangupCall(providerCallId: string): Promise<void> {
    this.assertConfigured();

    const url = `${TWILIO_API_BASE}/Accounts/${this.accountSid}/Calls/${providerCallId}.json`;
    const body = new URLSearchParams({ Status: 'completed' });
    const bodyStr = body.toString();

    pushIntegrationTrace({
      kind: 'twilio_rest',
      label: 'Twilio REST → POST Call instance (hangup)',
      meta: {
        url,
        method: 'POST',
        form: Object.fromEntries(body),
      },
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyStr,
    });

    const hangupJson = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    pushIntegrationTrace({
      kind: 'twilio_rest',
      label: 'Twilio REST ← hangup response',
      meta: {
        httpStatus: res.status,
        sid: hangupJson.sid,
        status: hangupJson.status,
        message: hangupJson.message,
        error: hangupJson.error,
      },
    });

    if (!res.ok) {
      throw new Error(`Twilio hangup error: ${hangupJson.message || res.statusText} (HTTP ${res.status})`);
    }
  }

  /** Validates API key/secret against the account record (no outbound call). */
  async verifyRestCredentials(): Promise<
    { ok: true; accountStatus: string; friendlyName?: string } | { ok: false; error: string; httpStatus?: number }
  > {
    this.assertConfigured();
    const url = `${TWILIO_API_BASE}/Accounts/${this.accountSid}.json`;

    pushIntegrationTrace({
      kind: 'twilio_rest',
      label: 'Twilio REST → GET Account (debug ping)',
      meta: { url, method: 'GET' },
    });

    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: this.authHeader() },
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    pushIntegrationTrace({
      kind: 'twilio_rest',
      label: 'Twilio REST ← Account response (debug ping)',
      meta: {
        httpStatus: res.status,
        status: json.status,
        friendlyName: json.friendly_name,
        message: json.message,
        code: json.code,
      },
    });

    if (!res.ok) {
      return {
        ok: false,
        error: String(json.message || res.statusText || 'Request failed'),
        httpStatus: res.status,
      };
    }

    return {
      ok: true,
      accountStatus: String(json.status ?? 'unknown'),
      friendlyName: typeof json.friendly_name === 'string' ? json.friendly_name : undefined,
    };
  }

  normalizeProviderEvent(raw: Record<string, string>): NormalizedProviderEvent {
    const callStatus = (raw.CallStatus || '').toLowerCase();
    const providerCallId = raw.CallSid || '';

    const typeMap: Record<string, NormalizedProviderEvent['type']> = {
      ringing: 'ringing',
      'in-progress': 'answered',
      completed: 'completed',
      failed: 'failed',
      'no-answer': 'no-answer',
      busy: 'busy',
      canceled: 'canceled',
    };

    return {
      type: typeMap[callStatus] || 'failed',
      providerCallId,
      timestamp: new Date(),
      raw: raw as Record<string, unknown>,
    };
  }

  respondWithVoiceActions(actions: VoiceAction[]): string {
    return buildTwiml(actions);
  }

  validateWebhookSignature(
    signature: string,
    url: string,
    params: Record<string, string>,
  ): boolean {
    if (!this.apiSecret) return false;

    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
      data += key + params[key];
    }

    const computed = createHmac('sha1', this.apiSecret)
      .update(data, 'utf-8')
      .digest('base64');

    return computed === signature;
  }
}

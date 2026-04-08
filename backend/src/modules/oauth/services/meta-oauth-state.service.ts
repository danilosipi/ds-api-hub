import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';

export type MetaOauthStatePayload = {
  account_id: string;
  user_id?: string;
  correlation_id: string;
  return_url?: string;
  exp: number;
};

const STATE_VERSION_SUFFIX = '.v1';

@Injectable()
export class MetaOauthStateService {
  private readonly logger = new Logger(MetaOauthStateService.name);

  private getSecret(): string | null {
    const primary = process.env.META_OAUTH_STATE_SECRET?.trim();
    if (primary) {
      return primary;
    }
    const fallback = process.env.META_APP_SECRET?.trim();
    if (fallback) {
      this.logger.warn(
        JSON.stringify({
          event: 'oauth.meta.state.secret_fallback',
          message:
            'META_OAUTH_STATE_SECRET ausente; usando META_APP_SECRET para assinar state (recomenda-se secret dedicado).',
        }),
      );
      return fallback;
    }
    return null;
  }

  sign(payload: Omit<MetaOauthStatePayload, 'exp'> & { exp?: number }): string {
    const secret = this.getSecret();
    if (!secret) {
      throw new Error(
        'META_OAUTH_STATE_SECRET ou META_APP_SECRET é obrigatório para assinar o state OAuth.',
      );
    }
    const ttlSec = Number(process.env.META_OAUTH_STATE_TTL_SEC) || 3600;
    const exp =
      payload.exp ?? Math.floor(Date.now() / 1000) + Math.max(60, ttlSec);
    const full: MetaOauthStatePayload = {
      account_id: payload.account_id.trim(),
      correlation_id: payload.correlation_id.trim(),
      exp,
      ...(payload.user_id != null &&
        String(payload.user_id).trim().length > 0 && {
          user_id: String(payload.user_id).trim(),
        }),
      ...(payload.return_url != null &&
        String(payload.return_url).trim().length > 0 && {
          return_url: String(payload.return_url).trim(),
        }),
    };
    const body = Buffer.from(JSON.stringify(full), 'utf8').toString(
      'base64url',
    );
    const sig = createHmac('sha256', secret)
      .update(body)
      .update(STATE_VERSION_SUFFIX)
      .digest('base64url');
    return `${body}.${sig}`;
  }

  verify(token: string): MetaOauthStatePayload | null {
    const secret = this.getSecret();
    if (!secret || typeof token !== 'string' || !token.includes('.')) {
      return null;
    }
    const lastDot = token.lastIndexOf('.');
    const body = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const expected = createHmac('sha256', secret)
      .update(body)
      .update(STATE_VERSION_SUFFIX)
      .digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    try {
      const json = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as MetaOauthStatePayload;
      if (
        typeof json.account_id !== 'string' ||
        json.account_id.trim().length === 0 ||
        typeof json.correlation_id !== 'string' ||
        json.correlation_id.trim().length === 0 ||
        typeof json.exp !== 'number'
      ) {
        return null;
      }
      if (json.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      return {
        account_id: json.account_id.trim(),
        correlation_id: json.correlation_id.trim(),
        exp: json.exp,
        ...(json.user_id != null && { user_id: String(json.user_id).trim() }),
        ...(json.return_url != null && {
          return_url: String(json.return_url).trim(),
        }),
      };
    } catch {
      return null;
    }
  }

  newCorrelationId(): string {
    return randomUUID();
  }
}

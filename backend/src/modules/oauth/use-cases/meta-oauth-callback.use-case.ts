import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { MetaOauthStateService } from '../services/meta-oauth-state.service';
import type { MetaOauthStatePayload } from '../services/meta-oauth-state.service';
import { MetaWhatsappOauthDiscoveryService } from '../../whatsapp/services/meta-whatsapp-oauth-discovery.service';
import { WhatsappMetaIntegrationPersistService } from '../../whatsapp/services/whatsapp-meta-integration-persist.service';

export type MetaOauthCallbackQuery = {
  code?: string;
  state?: string;
  error?: string;
  error_reason?: string;
  error_description?: string;
};

export type MetaOauthCallbackSuccessJsonBody = {
  success: true;
  provider: 'whatsapp_meta';
  status: 'connected';
  account_id: string;
  phone_number_id: string;
  display_phone_number: string;
  business_account_id: string | null;
  correlation_id: string;
  processor_synced: boolean;
};

export type MetaOauthCallbackErrorBody = {
  success: false;
  message: string;
  error?: string;
  error_reason?: string;
  error_description?: string;
  correlation_id?: string;
  details?: unknown;
};

export type MetaOauthCallbackResult =
  | { kind: 'redirect'; status: number; location: string }
  | {
      kind: 'json';
      status: number;
      body: MetaOauthCallbackSuccessJsonBody | MetaOauthCallbackErrorBody;
    };

function maskAccessToken(token: string): string {
  const t = token.trim();
  if (t.length <= 8) return '***';
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}

function appendSuccessQueryParam(url: string): string {
  const u = new URL(url);
  u.searchParams.set('success', 'whatsapp_meta');
  return u.toString();
}

function buildPostOAuthRedirect(
  state: MetaOauthStatePayload,
): string | null {
  const raw = state.return_url?.trim();
  if (!raw) {
    return null;
  }

  const appBase = process.env.FRONTEND_APP_BASE_URL?.trim();
  const origins = (process.env.META_OAUTH_ALLOWED_RETURN_ORIGINS?.split(',') ??
    [])
    .map((o) => o.trim())
    .filter(Boolean);

  try {
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      if (!appBase) {
        return null;
      }
      const resolved = new URL(raw, appBase.endsWith('/') ? appBase : `${appBase}/`);
      return appendSuccessQueryParam(resolved.toString());
    }

    const u = new URL(raw);
    if (origins.length === 0 || !origins.includes(u.origin)) {
      return null;
    }
    return appendSuccessQueryParam(u.toString());
  } catch {
    return null;
  }
}

@Injectable()
export class MetaOauthCallbackUseCase {
  private readonly logger = new Logger(MetaOauthCallbackUseCase.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly metaOauthStateService: MetaOauthStateService,
    private readonly metaWhatsappOauthDiscoveryService: MetaWhatsappOauthDiscoveryService,
    private readonly whatsappMetaIntegrationPersistService: WhatsappMetaIntegrationPersistService,
  ) {}

  async execute(query: MetaOauthCallbackQuery): Promise<MetaOauthCallbackResult> {
    const { code, state: stateRaw, error, error_reason, error_description } =
      query;

    this.logger.log(
      JSON.stringify({
        event: 'oauth.meta.callback.received',
        hasCode: typeof code === 'string' && code.length > 0,
        hasState: typeof stateRaw === 'string' && stateRaw.length > 0,
        hasError: typeof error === 'string' && error.length > 0,
      }),
    );

    if (error != null && String(error).length > 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'oauth.meta.callback.error',
          phase: 'meta_redirect',
          error,
          error_reason: error_reason ?? null,
        }),
      );
      return {
        kind: 'json',
        status: 400,
        body: {
          success: false,
          message: 'A Meta devolveu um erro no callback OAuth.',
          error: String(error),
          ...(error_reason != null && { error_reason: String(error_reason) }),
          ...(error_description != null && {
            error_description: String(error_description),
          }),
        },
      };
    }

    if (typeof stateRaw !== 'string' || stateRaw.trim().length === 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'oauth.meta.callback.error',
          phase: 'missing_state',
        }),
      );
      return {
        kind: 'json',
        status: 400,
        body: {
          success: false,
          message: 'Parâmetro state ausente. Utilize GET /oauth/meta/authorize com account_id.',
        },
      };
    }

    const statePayload = this.metaOauthStateService.verify(stateRaw.trim());
    if (!statePayload) {
      this.logger.warn(
        JSON.stringify({
          event: 'oauth.meta.callback.error',
          phase: 'invalid_state',
        }),
      );
      return {
        kind: 'json',
        status: 400,
        body: {
          success: false,
          message: 'State inválido ou expirado.',
        },
      };
    }

    const correlationId = statePayload.correlation_id;

    if (typeof code !== 'string' || code.trim().length === 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'oauth.meta.callback.error',
          phase: 'missing_code',
          correlation_id: correlationId,
        }),
      );
      return {
        kind: 'json',
        status: 400,
        body: {
          success: false,
          message: 'Parâmetro code ausente ou inválido.',
          correlation_id: correlationId,
        },
      };
    }

    const clientId = process.env.META_APP_ID?.trim();
    const clientSecret = process.env.META_APP_SECRET?.trim();
    const redirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim();

    if (!clientId || !clientSecret || !redirectUri) {
      this.logger.error(
        JSON.stringify({
          event: 'oauth.meta.callback.error',
          phase: 'config',
          correlation_id: correlationId,
          hasAppId: Boolean(clientId),
          hasAppSecret: Boolean(clientSecret),
          hasRedirectUri: Boolean(redirectUri),
        }),
      );
      return {
        kind: 'json',
        status: 500,
        body: {
          success: false,
          message:
            'Configuração OAuth incompleta (META_APP_ID, META_APP_SECRET ou META_OAUTH_REDIRECT_URI).',
          correlation_id: correlationId,
        },
      };
    }

    const graphVersion =
      process.env.META_GRAPH_API_VERSION?.trim() || 'v19.0';
    const graphOauthTokenUrl = `https://graph.facebook.com/${graphVersion}/oauth/access_token`;

    let accessToken: string;
    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          access_token?: string;
          token_type?: string;
          expires_in?: number;
          error?: { message?: string; type?: string; code?: number };
        }>(graphOauthTokenUrl, {
          params: {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code: code.trim(),
          },
          validateStatus: () => true,
        }),
      );

      const { data, status } = response;

      if (status >= 400 || data?.error) {
        this.logger.warn(
          JSON.stringify({
            event: 'oauth.meta.callback.error',
            phase: 'graph_token_exchange',
            correlation_id: correlationId,
            httpStatus: status,
            graphError: data?.error ?? null,
          }),
        );
        return {
          kind: 'json',
          status: 502,
          body: {
            success: false,
            message: 'Falha ao trocar code por access token na Graph API.',
            correlation_id: correlationId,
            details: data?.error ?? data ?? { httpStatus: status },
          },
        };
      }

      const token = data?.access_token;
      if (typeof token !== 'string' || token.length === 0) {
        this.logger.warn(
          JSON.stringify({
            event: 'oauth.meta.callback.error',
            phase: 'graph_token_exchange',
            correlation_id: correlationId,
            reason: 'no_access_token_in_response',
          }),
        );
        return {
          kind: 'json',
          status: 502,
          body: {
            success: false,
            message: 'Resposta da Graph API sem access_token.',
            correlation_id: correlationId,
            details: {
              token_type: data?.token_type,
              expires_in: data?.expires_in,
            },
          },
        };
      }

      accessToken = token;

      this.logger.log(
        JSON.stringify({
          event: 'oauth.meta.access_token.exchanged',
          correlation_id: correlationId,
          token_type: data.token_type ?? null,
          expires_in: data.expires_in ?? null,
          access_token_masked: maskAccessToken(accessToken),
        }),
      );
    } catch (err) {
      const axiosErr = err as AxiosError;
      const details =
        axiosErr.response?.data ??
        (axiosErr.message ? { message: axiosErr.message } : undefined);

      this.logger.error(
        JSON.stringify({
          event: 'oauth.meta.callback.error',
          phase: 'graph_token_exchange',
          correlation_id: correlationId,
          reason: 'request_failed',
          status: axiosErr.response?.status ?? null,
        }),
      );

      return {
        kind: 'json',
        status: 502,
        body: {
          success: false,
          message: 'Erro de rede ou resposta inesperada ao trocar o code.',
          correlation_id: correlationId,
          details,
        },
      };
    }

    const asset =
      await this.metaWhatsappOauthDiscoveryService.discoverFromUserToken(
        accessToken,
        correlationId,
      );

    if (!asset) {
      return {
        kind: 'json',
        status: 502,
        body: {
          success: false,
          message:
            'Não foi possível obter phone_number_id na Meta (permissões OAuth ou conta sem WABA/número).',
          correlation_id: correlationId,
        },
      };
    }

    const { routingOk, processorOk } =
      await this.whatsappMetaIntegrationPersistService.persistAfterOauth({
        accountId: statePayload.account_id,
        accessToken,
        asset,
        correlationId,
      });

    if (!routingOk) {
      return {
        kind: 'json',
        status: 500,
        body: {
          success: false,
          message:
            'Falha ao persistir o roteamento WhatsApp no hub (ver WHATSAPP_INTEGRATIONS_DYNAMIC_PATH e permissões de ficheiro).',
          correlation_id: correlationId,
        },
      };
    }

    if (!processorOk && process.env.PROCESSOR_INTEGRATION_UPSERT_URL?.trim()) {
      this.logger.warn(
        JSON.stringify({
          event: 'oauth.meta.integration.persist_error',
          phase: 'processor_required_but_failed',
          correlation_id: correlationId,
          account_id: statePayload.account_id,
        }),
      );
    }

    const redirect = buildPostOAuthRedirect(statePayload);
    if (redirect) {
      return { kind: 'redirect', status: 302, location: redirect };
    }

    return {
      kind: 'json',
      status: 200,
      body: {
        success: true,
        provider: 'whatsapp_meta',
        status: 'connected',
        account_id: statePayload.account_id,
        phone_number_id: asset.phone_number_id,
        display_phone_number: asset.display_phone_number,
        business_account_id: asset.business_account_id,
        correlation_id: correlationId,
        processor_synced: processorOk,
      },
    };
  }
}

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

const GRAPH_OAUTH_TOKEN_URL =
  'https://graph.facebook.com/v19.0/oauth/access_token';

export type MetaOauthCallbackQuery = {
  code?: string;
  state?: string;
  error?: string;
  error_reason?: string;
  error_description?: string;
};

export type MetaOauthCallbackSuccessBody = {
  success: true;
  access_token: string;
  raw: {
    token_type?: string;
    expires_in?: number;
  };
};

export type MetaOauthCallbackErrorBody = {
  success: false;
  message: string;
  error?: string;
  error_reason?: string;
  error_description?: string;
  details?: unknown;
};

export type MetaOauthCallbackResult =
  | { status: 200; body: MetaOauthCallbackSuccessBody }
  | { status: number; body: MetaOauthCallbackErrorBody };

function maskAccessToken(token: string): string {
  const t = token.trim();
  if (t.length <= 8) return '***';
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}

@Injectable()
export class MetaOauthCallbackUseCase {
  private readonly logger = new Logger(MetaOauthCallbackUseCase.name);

  constructor(private readonly httpService: HttpService) {}

  async execute(query: MetaOauthCallbackQuery): Promise<MetaOauthCallbackResult> {
    const { code, state, error, error_reason, error_description } = query;

    this.logger.log(
      JSON.stringify({
        event: 'oauth.meta.callback.received',
        hasCode: typeof code === 'string' && code.length > 0,
        hasState: typeof state === 'string' && state.length > 0,
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

    if (typeof code !== 'string' || code.trim().length === 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'oauth.meta.callback.error',
          phase: 'missing_code',
        }),
      );
      return {
        status: 400,
        body: {
          success: false,
          message: 'Parâmetro code ausente ou inválido.',
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
          hasAppId: Boolean(clientId),
          hasAppSecret: Boolean(clientSecret),
          hasRedirectUri: Boolean(redirectUri),
        }),
      );
      return {
        status: 500,
        body: {
          success: false,
          message:
            'Configuração OAuth incompleta (META_APP_ID, META_APP_SECRET ou META_OAUTH_REDIRECT_URI).',
        },
      };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          access_token?: string;
          token_type?: string;
          expires_in?: number;
          error?: { message?: string; type?: string; code?: number };
        }>(GRAPH_OAUTH_TOKEN_URL, {
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
            httpStatus: status,
            graphError: data?.error ?? null,
          }),
        );
        return {
          status: 502,
          body: {
            success: false,
            message: 'Falha ao trocar code por access token na Graph API.',
            details: data?.error ?? data ?? { httpStatus: status },
          },
        };
      }

      const accessToken = data?.access_token;
      if (typeof accessToken !== 'string' || accessToken.length === 0) {
        this.logger.warn(
          JSON.stringify({
            event: 'oauth.meta.callback.error',
            phase: 'graph_token_exchange',
            reason: 'no_access_token_in_response',
          }),
        );
        return {
          status: 502,
          body: {
            success: false,
            message: 'Resposta da Graph API sem access_token.',
            details: {
              token_type: data?.token_type,
              expires_in: data?.expires_in,
            },
          },
        };
      }

      this.logger.log(
        JSON.stringify({
          event: 'oauth.meta.access_token.exchanged',
          token_type: data.token_type ?? null,
          expires_in: data.expires_in ?? null,
        }),
      );

      return {
        status: 200,
        body: {
          success: true,
          access_token: maskAccessToken(accessToken),
          raw: {
            token_type: data.token_type,
            expires_in: data.expires_in,
          },
        },
      };
    } catch (err) {
      const axiosErr = err as AxiosError;
      const details =
        axiosErr.response?.data ??
        (axiosErr.message ? { message: axiosErr.message } : undefined);

      this.logger.error(
        JSON.stringify({
          event: 'oauth.meta.callback.error',
          phase: 'graph_token_exchange',
          reason: 'request_failed',
          status: axiosErr.response?.status ?? null,
        }),
      );

      return {
        status: 502,
        body: {
          success: false,
          message: 'Erro de rede ou resposta inesperada ao trocar o code.',
          details,
        },
      };
    }
  }
}

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

export type WhatsappAssetDiscovery = {
  phone_number_id: string;
  display_phone_number: string;
  business_account_id: string | null;
};

@Injectable()
export class MetaWhatsappOauthDiscoveryService {
  private readonly logger = new Logger(MetaWhatsappOauthDiscoveryService.name);

  constructor(private readonly httpService: HttpService) {}

  private graphBase(): string {
    const v = process.env.META_GRAPH_API_VERSION?.trim() || 'v19.0';
    return `https://graph.facebook.com/${v}`;
  }

  /**
   * Descobre WABA e número de telefone a partir do access_token do utilizador (OAuth).
   */
  async discoverFromUserToken(
    accessToken: string,
    correlationId: string,
  ): Promise<WhatsappAssetDiscovery | null> {
    const base = this.graphBase();
    const fields =
      'businesses{' +
      'owned_whatsapp_business_accounts{' +
      'id,phone_numbers{id,display_phone_number}' +
      '},' +
      'client_whatsapp_business_accounts{' +
      'id,phone_numbers{id,display_phone_number}' +
      '}' +
      '}';

    this.logger.log(
      JSON.stringify({
        event: 'oauth.meta.integration.discovery.started',
        correlation_id: correlationId,
      }),
    );

    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          businesses?: {
            data?: Array<{
              owned_whatsapp_business_accounts?: {
                data?: Array<{
                  id?: string;
                  phone_numbers?: {
                    data?: Array<{
                      id?: string;
                      display_phone_number?: string;
                    }>;
                  };
                }>;
              };
              client_whatsapp_business_accounts?: {
                data?: Array<{
                  id?: string;
                  phone_numbers?: {
                    data?: Array<{
                      id?: string;
                      display_phone_number?: string;
                    }>;
                  };
                }>;
              };
            }>;
          };
          error?: { message?: string };
        }>(`${base}/me`, {
          params: {
            fields,
            access_token: accessToken,
          },
          validateStatus: () => true,
        }),
      );

      const { data, status } = response;
      if (status >= 400 || data?.error) {
        this.logger.warn(
          JSON.stringify({
            event: 'oauth.meta.integration.discovery.graph_error',
            correlation_id: correlationId,
            httpStatus: status,
            graphError: data?.error ?? null,
          }),
        );
        return null;
      }

      const businesses = data?.businesses?.data ?? [];
      for (const biz of businesses) {
        const wabaLists = [
          biz?.owned_whatsapp_business_accounts?.data ?? [],
          biz?.client_whatsapp_business_accounts?.data ?? [],
        ];
        for (const wabas of wabaLists) {
          for (const waba of wabas) {
            const wabaId = waba?.id?.trim();
            const phones = waba?.phone_numbers?.data ?? [];
            for (const p of phones) {
              const pid = p?.id?.trim();
              const display = p?.display_phone_number?.trim();
              if (pid && display) {
                const asset: WhatsappAssetDiscovery = {
                  phone_number_id: pid,
                  display_phone_number: display,
                  business_account_id: wabaId ?? null,
                };
                this.logger.log(
                  JSON.stringify({
                    event: 'oauth.meta.integration.discovery.success',
                    correlation_id: correlationId,
                    phone_number_id: pid,
                    has_business_account_id: Boolean(wabaId),
                  }),
                );
                return asset;
              }
            }
          }
        }
      }

      this.logger.warn(
        JSON.stringify({
          event: 'oauth.meta.integration.discovery.empty',
          correlation_id: correlationId,
          message:
            'Nenhum phone_number_id encontrado em businesses/WABA (permissões ou conta sem número).',
        }),
      );
      return null;
    } catch (err) {
      const axiosErr = err as AxiosError;
      this.logger.error(
        JSON.stringify({
          event: 'oauth.meta.integration.discovery.graph_error',
          correlation_id: correlationId,
          reason: 'request_failed',
          status: axiosErr.response?.status ?? null,
        }),
      );
      return null;
    }
  }
}

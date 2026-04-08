import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { WhatsappIntegrationRepository } from '../repositories/whatsapp-integration.repository';
import type { WhatsappAssetDiscovery } from './meta-whatsapp-oauth-discovery.service';

export type WhatsappMetaIntegrationMetadata = {
  access_token: string;
  phone_number_id: string;
  display_phone_number: string;
  business_account_id: string | null;
  webhook_verify_token: string | null;
  webhook_url: string | null;
  connected_at: string;
  last_synced_at: string;
};

@Injectable()
export class WhatsappMetaIntegrationPersistService {
  private readonly logger = new Logger(
    WhatsappMetaIntegrationPersistService.name,
  );

  constructor(
    private readonly httpService: HttpService,
    private readonly whatsappIntegrationRepository: WhatsappIntegrationRepository,
  ) {}

  buildWebhookUrl(): string | null {
    const base =
      process.env.PUBLIC_HUB_BASE_URL?.trim() ||
      process.env.META_WEBHOOK_PUBLIC_BASE_URL?.trim();
    if (!base) {
      return null;
    }
    const path = '/webhooks/whatsapp/meta';
    return `${base.replace(/\/$/, '')}${path}`;
  }

  async persistAfterOauth(params: {
    accountId: string;
    accessToken: string;
    asset: WhatsappAssetDiscovery;
    correlationId: string;
  }): Promise<{ routingOk: boolean; processorOk: boolean }> {
    const now = new Date().toISOString();
    const verifyToken =
      process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || null;
    const webhookUrl = this.buildWebhookUrl();

    const metadata: WhatsappMetaIntegrationMetadata = {
      access_token: params.accessToken,
      phone_number_id: params.asset.phone_number_id,
      display_phone_number: params.asset.display_phone_number,
      business_account_id: params.asset.business_account_id,
      webhook_verify_token: verifyToken,
      webhook_url: webhookUrl,
      connected_at: now,
      last_synced_at: now,
    };

    let routingOk = false;
    try {
      await this.whatsappIntegrationRepository.upsertWhatsappMetaRouting({
        account_id: params.accountId,
        phone_number_id: params.asset.phone_number_id,
        display_phone_number: params.asset.display_phone_number,
      });
      routingOk = true;
    } catch (e) {
      this.logger.error(
        JSON.stringify({
          event: 'oauth.meta.integration.persist_error',
          phase: 'routing_store',
          correlation_id: params.correlationId,
          account_id: params.accountId,
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    }

    const upsertUrl = process.env.PROCESSOR_INTEGRATION_UPSERT_URL?.trim();
    let processorOk = false;
    if (!upsertUrl) {
      this.logger.log(
        JSON.stringify({
          event: 'oauth.meta.integration.processor_skip',
          correlation_id: params.correlationId,
          reason: 'PROCESSOR_INTEGRATION_UPSERT_URL não definido',
        }),
      );
    } else {
      const secret = process.env.PROCESSOR_INTEGRATION_UPSERT_SECRET?.trim();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-account-id': params.accountId,
        'x-correlation-id': params.correlationId,
      };
      if (secret) {
        headers['x-hub-integration-secret'] = secret;
      }

      const body = {
        account_id: params.accountId,
        provider: 'whatsapp_meta',
        status: 'connected',
        metadata,
      };

      try {
        const response = await firstValueFrom(
          this.httpService.post(upsertUrl, body, {
            headers,
            validateStatus: () => true,
          }),
        );
        if (response.status >= 200 && response.status < 300) {
          processorOk = true;
        } else {
          this.logger.error(
            JSON.stringify({
              event: 'oauth.meta.integration.persist_error',
              phase: 'processor_http',
              correlation_id: params.correlationId,
              httpStatus: response.status,
            }),
          );
        }
      } catch (err) {
        const axiosErr = err as AxiosError;
        this.logger.error(
          JSON.stringify({
            event: 'oauth.meta.integration.persist_error',
            phase: 'processor_http',
            correlation_id: params.correlationId,
            reason: 'request_failed',
            status: axiosErr.response?.status ?? null,
          }),
        );
      }
    }

    if (routingOk || processorOk) {
      this.logger.log(
        JSON.stringify({
          event: 'oauth.meta.integration.persisted',
          correlation_id: params.correlationId,
          account_id: params.accountId,
          provider: 'whatsapp_meta',
          routing_ok: routingOk,
          processor_ok: processorOk,
        }),
      );
    }

    return { routingOk, processorOk };
  }
}

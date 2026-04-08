import { Injectable, Logger } from '@nestjs/common';
import { WhatsappIntegrationRepository } from '../repositories/whatsapp-integration.repository';
import type { MetaIncomingParsed } from '../types/meta-whatsapp-incoming.types';
import { WhatsappOutboundClientService } from './whatsapp-outbound-client.service';

@Injectable()
export class MetaWhatsappWebhookService {
  private readonly logger = new Logger(MetaWhatsappWebhookService.name);

  constructor(
    private readonly whatsappOutboundClient: WhatsappOutboundClientService,
    private readonly whatsappIntegrationRepository: WhatsappIntegrationRepository,
  ) {}

  private parseIncoming(body: any): MetaIncomingParsed {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const hasMessages =
      Array.isArray(value?.messages) && value.messages.length > 0;
    const hasStatuses =
      Array.isArray(value?.statuses) && value.statuses.length > 0;

    if (hasMessages) {
      const contact = value?.contacts?.[0];
      const message = value?.messages?.[0];

      return {
        kind: 'message',
        data: {
          messagingProduct: value?.messaging_product ?? null,
          displayPhoneNumber: value?.metadata?.display_phone_number ?? null,
          phoneNumberId: value?.metadata?.phone_number_id ?? null,
          customerWaId: contact?.wa_id ?? null,
          customerName: contact?.profile?.name ?? null,
          messageId: message?.id ?? null,
          from: message?.from ?? null,
          timestamp: message?.timestamp ?? null,
          type: message?.type ?? null,
          textBody: message?.text?.body ?? null,
        },
      };
    }

    if (hasStatuses) {
      const s = value.statuses[0];
      return {
        kind: 'status',
        data: {
          phoneNumberId: value?.metadata?.phone_number_id ?? null,
          displayPhoneNumber: value?.metadata?.display_phone_number ?? null,
          messageId: s?.id ?? null,
          status: s?.status ?? null,
          timestamp: s?.timestamp ?? null,
          recipientId: s?.recipient_id ?? null,
        },
      };
    }

    return {
      kind: 'unknown',
      data: {
        rawObject: body?.object ?? null,
        hasEntry: Array.isArray(body?.entry),
        changeField: body?.entry?.[0]?.changes?.[0]?.field ?? null,
      },
    };
  }

  processIncoming(body: any): void {
    const parsed = this.parseIncoming(body);

    if (parsed.kind === 'message') {
      const value = body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];

      if (!value || !message) {
        this.logger.warn('META WEBHOOK POST recebido sem mensagem útil.');
        return;
      }

      this.logger.log(`META WEBHOOK MESSAGE: ${JSON.stringify(parsed.data)}`);
    } else if (parsed.kind === 'status') {
      this.logger.log(`META WEBHOOK STATUS: ${JSON.stringify(parsed.data)}`);
    } else {
      this.logger.log(
        `META WEBHOOK EVENTO NÃO MAPEADO: ${JSON.stringify(parsed.data)}`,
      );
    }

    if (parsed.kind !== 'message' && parsed.kind !== 'status') {
      return;
    }

    let accountId = this.whatsappIntegrationRepository.resolveAccountId(
      parsed.data.phoneNumberId,
      parsed.data.displayPhoneNumber,
    );

    if (!accountId && process.env.PROCESSOR_ACCOUNT_ID?.trim()) {
      this.logger.warn(
        'account_id via PROCESSOR_ACCOUNT_ID (legado). Para multi-tenant, use WHATSAPP_INTEGRATIONS_JSON.',
      );
      accountId = process.env.PROCESSOR_ACCOUNT_ID.trim();
    }

    if (!accountId) {
      this.logger.warn(
        `Evento WhatsApp não encaminhado: integração não encontrada para phone_number_id=${parsed.data.phoneNumberId ?? '(nulo)'} display=${parsed.data.displayPhoneNumber ?? '(nulo)'}`,
      );
      return;
    }

    void this.whatsappOutboundClient.sendEvent({
      kind: parsed.kind,
      account_id: accountId,
      data: parsed.data,
    });
  }
}

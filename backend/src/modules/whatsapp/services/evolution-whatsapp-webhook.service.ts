import { Injectable, Logger } from '@nestjs/common';
import { WhatsappIntegrationRepository } from '../repositories/whatsapp-integration.repository';
import type { MetaIncomingParsed } from '../types/meta-whatsapp-incoming.types';
import { WhatsappOutboundClientService } from './whatsapp-outbound-client.service';

@Injectable()
export class EvolutionWhatsappWebhookService {
  private readonly logger = new Logger(EvolutionWhatsappWebhookService.name);

  constructor(
    private readonly whatsappOutboundClient: WhatsappOutboundClientService,
    private readonly whatsappIntegrationRepository: WhatsappIntegrationRepository,
  ) {}

  private parseIncoming(body: any): MetaIncomingParsed {
    const data = body?.data ?? {};
    const key = data?.key ?? {};
    const message = data?.message ?? {};
    const instanceRaw = body?.instance;
    const instance =
      typeof instanceRaw === 'string'
        ? instanceRaw
        : typeof instanceRaw?.instanceName === 'string'
          ? instanceRaw.instanceName
          : null;
    const fromMe = key?.fromMe === true;

    const remoteJid =
      typeof key?.remoteJid === 'string' ? key.remoteJid.trim() : '';
    const participant =
      typeof key?.participant === 'string' ? key.participant.trim() : '';
    const senderPhone = this.extractDigitsFromJid(participant || remoteJid);
    const displayPhoneNumber = this.extractDigits(
      body?.instance?.integration ?? body?.instance?.instanceName ?? null,
    );
    const phoneNumberId = this.extractDigits(
      body?.instance?.instanceId ?? body?.instance?.instanceName ?? null,
    );

    const messageId = key?.id ?? body?.event_id ?? null;
    const timestamp = data?.messageTimestamp
      ? String(data.messageTimestamp)
      : null;
    const textBody =
      message?.conversation ??
      message?.extendedTextMessage?.text ??
      message?.imageMessage?.caption ??
      message?.videoMessage?.caption ??
      null;

    const isMessageEvent =
      body?.event === 'messages.upsert' &&
      typeof remoteJid === 'string' &&
      remoteJid.length > 0 &&
      !fromMe;

    if (isMessageEvent) {
      return {
        kind: 'message',
        data: {
          messagingProduct: 'whatsapp',
          displayPhoneNumber,
          phoneNumberId,
          rawInstance: instance,
          customerWaId: senderPhone,
          customerName: data?.pushName ?? null,
          messageId,
          from: senderPhone,
          timestamp,
          type: this.detectMessageType(message),
          textBody,
        },
      };
    }

    const statusName = this.detectStatus(body);
    if (statusName) {
      return {
        kind: 'status',
        data: {
          phoneNumberId,
          displayPhoneNumber,
          rawInstance: instance,
          messageId,
          status: statusName,
          timestamp,
          recipientId: senderPhone,
        },
      };
    }

    return {
      kind: 'unknown',
      data: {
        rawObject: body?.event ?? null,
        hasEntry: false,
        changeField: body?.event ?? null,
      },
    };
  }

  processIncoming(body: any): void {
    const parsed = this.parseIncoming(body);

    if (parsed.kind === 'message') {
      this.logger.log(
        JSON.stringify({
          event: 'whatsapp.evolution.message.normalized',
          messageId: parsed.data.messageId ?? null,
          from: parsed.data.from ?? null,
          phoneNumberId: parsed.data.phoneNumberId ?? null,
        }),
      );
    } else if (parsed.kind === 'status') {
      this.logger.log(
        `EVOLUTION WEBHOOK STATUS: ${JSON.stringify(parsed.data)}`,
      );
    } else {
      this.logger.log(
        `EVOLUTION WEBHOOK EVENTO NÃO MAPEADO: ${JSON.stringify(parsed.data)}`,
      );
    }

    if (parsed.kind !== 'message' && parsed.kind !== 'status') {
      return;
    }

    const instance =
      typeof parsed.data.rawInstance === 'string'
        ? parsed.data.rawInstance.trim()
        : '';
    let accountId =
      this.whatsappIntegrationRepository.resolveEvolutionAccountId(instance);

    if (accountId) {
      this.logger.log(
        JSON.stringify({
          event: 'whatsapp.evolution.account.resolved',
          resolver: 'instance',
          instance: instance || null,
          account_id: accountId,
        }),
      );
    }

    if (!accountId && process.env.PROCESSOR_ACCOUNT_ID?.trim()) {
      this.logger.warn(
        'account_id via PROCESSOR_ACCOUNT_ID (legado). Para multi-tenant, use WHATSAPP_INTEGRATIONS_JSON.',
      );
      accountId = process.env.PROCESSOR_ACCOUNT_ID.trim();
      this.logger.log(
        JSON.stringify({
          event: 'whatsapp.evolution.account.resolved',
          resolver: 'processor_account_id',
          instance: instance || null,
          account_id: accountId,
        }),
      );
    }

    if (!accountId) {
      this.logger.warn(
        `Evento WhatsApp Evolution não encaminhado: integração não encontrada para instance=${instance || '(nulo)'}`,
      );
      return;
    }

    void this.whatsappOutboundClient.sendEvent(
      {
        kind: parsed.kind,
        account_id: accountId,
        data: parsed.data,
      },
      'evolution',
    );
  }

  private detectMessageType(message: any): string | null {
    if (message?.conversation || message?.extendedTextMessage) {
      return 'text';
    }
    const keys = Object.keys(message ?? {}).filter(Boolean);
    if (keys.length === 0) {
      return null;
    }
    return keys[0].replace(/Message$/, '').toLowerCase();
  }

  private detectStatus(body: any): string | null {
    const event = String(body?.event ?? '').toLowerCase();
    if (event.includes('delivery') || event.includes('delivered')) {
      return 'delivered';
    }
    if (event.includes('read')) {
      return 'read';
    }
    if (event.includes('sent')) {
      return 'sent';
    }
    return null;
  }

  private extractDigits(value: unknown): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }
    const digits = value.replace(/\D/g, '');
    return digits.length > 0 ? digits : null;
  }

  private extractDigitsFromJid(value: unknown): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }
    const jid = value.split('@')[0];
    const digits = jid.replace(/\D/g, '');
    return digits.length > 0 ? digits : null;
  }
}

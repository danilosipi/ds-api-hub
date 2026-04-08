import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import type {
  MetaIncomingMessageData,
  MetaIncomingStatusData,
} from '../types/meta-whatsapp-incoming.types';

export type WhatsappProcessorPayload = {
  kind: 'message' | 'status';
  account_id: string;
  data: MetaIncomingMessageData | MetaIncomingStatusData;
};

@Injectable()
export class WhatsappOutboundClientService {
  private readonly logger = new Logger(WhatsappOutboundClientService.name);

  constructor(private readonly httpService: HttpService) {}

  async sendEvent(payload: WhatsappProcessorPayload): Promise<void> {
    const base = process.env.PROCESSOR_API_URL;
    if (!base?.trim()) {
      this.logger.error('ERRO AO ENVIAR EVENTO PARA PROCESSADOR');
      return;
    }

    const phoneNumberId = payload.data.phoneNumberId ?? '(nulo)';
    this.logger.log(
      JSON.stringify({
        event: 'whatsapp.event.forwarding',
        account_id: payload.account_id,
        phoneNumberId,
        provider: 'meta',
      }),
    );

    const url = `${base.replace(/\/$/, '')}/whatsapp/webhook`;

    try {
      await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'x-account-id': payload.account_id,
            'Content-Type': 'application/json',
          },
        }),
      );
      this.logger.log('EVENTO ENVIADO PARA PROCESSADOR');
    } catch {
      this.logger.error('ERRO AO ENVIAR EVENTO PARA PROCESSADOR');
    }
  }
}

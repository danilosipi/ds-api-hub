import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class WhatsappOutboundClientService {
  private readonly logger = new Logger(WhatsappOutboundClientService.name);

  constructor(private readonly httpService: HttpService) {}

  async sendEvent(payload: any): Promise<void> {
    const base = process.env.PROCESSOR_API_URL;
    if (!base?.trim()) {
      this.logger.error('ERRO AO ENVIAR EVENTO PARA PROCESSADOR');
      return;
    }

    const url = `${base.replace(/\/$/, '')}/whatsapp/webhook`;
    const accountId = process.env.PROCESSOR_ACCOUNT_ID ?? 'dev-account';

    try {
      await firstValueFrom(
        this.httpService.post(
          url,
          { source: 'meta', ...payload },
          {
            headers: {
              'x-account-id': accountId,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      this.logger.log('EVENTO ENVIADO PARA PROCESSADOR');
    } catch {
      this.logger.error('ERRO AO ENVIAR EVENTO PARA PROCESSADOR');
    }
  }
}

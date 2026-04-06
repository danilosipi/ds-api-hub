import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

@Controller('webhooks/whatsapp/meta')
export class MetaWhatsappWebhookController {
  private readonly logger = new Logger(MetaWhatsappWebhookController.name);

  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ): void {
    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

    const challengeOk =
      typeof challenge === 'string' && challenge.trim().length > 0;

    this.logger.log(
      `Verificação Meta webhook: mode=${mode ?? '(ausente)'}, challengeNaoVazio=${challengeOk}, tokenConfigurado=${Boolean(expectedToken)}`,
    );

    if (!expectedToken) {
      this.logger.warn(
        'META_WEBHOOK_VERIFY_TOKEN não definido; verificação rejeitada.',
      );
      res.status(403).send();
      return;
    }

    const ok =
      mode === 'subscribe' &&
      verifyToken === expectedToken &&
      challengeOk;

    if (!ok) {
      this.logger.warn('Verificação Meta webhook falhou (403).');
      res.status(403).send();
      return;
    }

    this.logger.log('Verificação Meta webhook concluída com sucesso.');
    res.status(200).type('text/plain').send(challenge);
  }

  @Post()
  receive(@Body() body: any, @Res() res: Response): void {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const contact = value?.contacts?.[0];
    const message = value?.messages?.[0];

    if (!value || !message) {
      this.logger.warn('META WEBHOOK POST recebido sem mensagem útil.');
      res.status(200).json({ received: true });
      return;
    }

    const summary = {
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
    };

    this.logger.log(`META WEBHOOK MESSAGE: ${JSON.stringify(summary)}`);
    res.status(200).json({ received: true });
  }
}

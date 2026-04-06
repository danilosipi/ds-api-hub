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
    this.logger.log(`META WEBHOOK POST: ${JSON.stringify(body)}`);
    res.status(200).json({ received: true });
  }
}

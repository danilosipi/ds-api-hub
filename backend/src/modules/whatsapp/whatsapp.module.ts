import { Module } from '@nestjs/common';
import { MetaWhatsappWebhookController } from './controllers/meta-whatsapp-webhook.controller';

@Module({
  controllers: [MetaWhatsappWebhookController],
})
export class WhatsappModule {}

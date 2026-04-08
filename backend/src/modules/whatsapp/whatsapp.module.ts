import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MetaWhatsappWebhookController } from './controllers/meta-whatsapp-webhook.controller';
import { WhatsappIntegrationRepository } from './repositories/whatsapp-integration.repository';
import { MetaWhatsappWebhookService } from './services/meta-whatsapp-webhook.service';
import { WhatsappOutboundClientService } from './services/whatsapp-outbound-client.service';

@Module({
  imports: [HttpModule],
  controllers: [MetaWhatsappWebhookController],
  providers: [
    WhatsappIntegrationRepository,
    MetaWhatsappWebhookService,
    WhatsappOutboundClientService,
  ],
})
export class WhatsappModule {}

import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MetaWhatsappWebhookController } from './controllers/meta-whatsapp-webhook.controller';
import { WhatsappIntegrationRepository } from './repositories/whatsapp-integration.repository';
import { MetaWhatsappOauthDiscoveryService } from './services/meta-whatsapp-oauth-discovery.service';
import { MetaWhatsappWebhookService } from './services/meta-whatsapp-webhook.service';
import { WhatsappMetaIntegrationPersistService } from './services/whatsapp-meta-integration-persist.service';
import { WhatsappOutboundClientService } from './services/whatsapp-outbound-client.service';

@Module({
  imports: [HttpModule],
  controllers: [MetaWhatsappWebhookController],
  providers: [
    WhatsappIntegrationRepository,
    MetaWhatsappWebhookService,
    WhatsappOutboundClientService,
    MetaWhatsappOauthDiscoveryService,
    WhatsappMetaIntegrationPersistService,
  ],
  exports: [
    WhatsappIntegrationRepository,
    MetaWhatsappOauthDiscoveryService,
    WhatsappMetaIntegrationPersistService,
  ],
})
export class WhatsappModule {}

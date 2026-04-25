import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { EvolutionWhatsappWebhookController } from './controllers/evolution-whatsapp-webhook.controller';
import { MetaWhatsappWebhookController } from './controllers/meta-whatsapp-webhook.controller';
import { WhatsappIntegrationRepository } from './repositories/whatsapp-integration.repository';
import { EvolutionWhatsappWebhookService } from './services/evolution-whatsapp-webhook.service';
import { MetaWhatsappOauthDiscoveryService } from './services/meta-whatsapp-oauth-discovery.service';
import { MetaWhatsappWebhookService } from './services/meta-whatsapp-webhook.service';
import { WhatsappMetaIntegrationPersistService } from './services/whatsapp-meta-integration-persist.service';
import { WhatsappOutboundClientService } from './services/whatsapp-outbound-client.service';

@Module({
  imports: [HttpModule],
  controllers: [MetaWhatsappWebhookController, EvolutionWhatsappWebhookController],
  providers: [
    WhatsappIntegrationRepository,
    MetaWhatsappWebhookService,
    EvolutionWhatsappWebhookService,
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

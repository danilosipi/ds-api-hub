import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { OauthModule } from './modules/oauth/oauth.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule, OauthModule],
  controllers: [HealthController],
})
export class AppModule {}

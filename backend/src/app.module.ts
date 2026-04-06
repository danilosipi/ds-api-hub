import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  controllers: [HealthController],
})
export class AppModule {}

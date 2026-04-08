import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MetaOauthAuthorizeController } from './controllers/meta-oauth-authorize.controller';
import { MetaOauthCallbackController } from './controllers/meta-oauth-callback.controller';
import { MetaOauthStateService } from './services/meta-oauth-state.service';
import { MetaOauthCallbackUseCase } from './use-cases/meta-oauth-callback.use-case';

@Module({
  imports: [HttpModule, WhatsappModule],
  controllers: [MetaOauthCallbackController, MetaOauthAuthorizeController],
  providers: [MetaOauthCallbackUseCase, MetaOauthStateService],
})
export class OauthModule {}

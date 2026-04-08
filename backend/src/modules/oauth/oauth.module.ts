import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MetaOauthCallbackController } from './controllers/meta-oauth-callback.controller';
import { MetaOauthCallbackUseCase } from './use-cases/meta-oauth-callback.use-case';

@Module({
  imports: [HttpModule],
  controllers: [MetaOauthCallbackController],
  providers: [MetaOauthCallbackUseCase],
})
export class OauthModule {}

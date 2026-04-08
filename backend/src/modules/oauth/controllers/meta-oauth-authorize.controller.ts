import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { MetaOauthStateService } from '../services/meta-oauth-state.service';

@Controller('oauth/meta')
export class MetaOauthAuthorizeController {
  private readonly logger = new Logger(MetaOauthAuthorizeController.name);

  constructor(private readonly metaOauthStateService: MetaOauthStateService) {}

  @Get('authorize')
  authorize(
    @Query('account_id') accountId: string | undefined,
    @Query('return_url') returnUrl: string | undefined,
    @Query('user_id') userId: string | undefined,
    @Query('correlation_id') correlationId: string | undefined,
    @Res() res: Response,
  ): void {
    const aid = accountId?.trim();
    if (!aid) {
      throw new BadRequestException('account_id é obrigatório.');
    }

    const clientId = process.env.META_APP_ID?.trim();
    const redirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim();
    if (!clientId || !redirectUri) {
      throw new BadRequestException(
        'OAuth Meta não configurado (META_APP_ID / META_OAUTH_REDIRECT_URI).',
      );
    }

    const graphVersion =
      process.env.META_GRAPH_API_VERSION?.trim() || 'v19.0';
    const scopes =
      process.env.META_OAUTH_SCOPES?.trim() ||
      'whatsapp_business_management,business_management';

    const cid =
      correlationId?.trim() || this.metaOauthStateService.newCorrelationId();

    let state: string;
    try {
      state = this.metaOauthStateService.sign({
        account_id: aid,
        correlation_id: cid,
        ...(userId?.trim() && { user_id: userId.trim() }),
        ...(returnUrl?.trim() && { return_url: returnUrl.trim() }),
      });
    } catch (e) {
      this.logger.error(
        JSON.stringify({
          event: 'oauth.meta.authorize.state_error',
          message: e instanceof Error ? e.message : String(e),
        }),
      );
      throw new BadRequestException(
        'Não foi possível preparar o state OAuth (secret de assinatura).',
      );
    }

    const oauthBase =
      process.env.META_OAUTH_DIALOG_BASE?.trim() ||
      `https://www.facebook.com/${graphVersion}/dialog/oauth`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: scopes,
    });

    const location = `${oauthBase}?${params.toString()}`;

    this.logger.log(
      JSON.stringify({
        event: 'oauth.meta.authorize.redirect',
        account_id: aid,
        correlation_id: cid,
        has_return_url: Boolean(returnUrl?.trim()),
      }),
    );

    res.redirect(302, location);
  }
}

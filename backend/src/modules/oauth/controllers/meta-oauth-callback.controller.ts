import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetaOauthCallbackUseCase } from '../use-cases/meta-oauth-callback.use-case';

@Controller('oauth/meta')
export class MetaOauthCallbackController {
  constructor(
    private readonly metaOauthCallbackUseCase: MetaOauthCallbackUseCase,
  ) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_reason') error_reason: string | undefined,
    @Query('error_description') error_description: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.metaOauthCallbackUseCase.execute({
      code,
      state,
      error,
      error_reason,
      error_description,
    });
    res.status(result.status).json(result.body);
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/** Registro vindo de WHATSAPP_INTEGRATIONS_JSON (snake_case no contrato de configuração). */
type IntegrationConfigRow = {
  phone_number_id: string;
  account_id: string;
  display_phone_number?: string;
};

@Injectable()
export class WhatsappIntegrationRepository implements OnModuleInit {
  private readonly logger = new Logger(WhatsappIntegrationRepository.name);
  private byPhoneNumberId = new Map<string, string>();
  private byDisplayNormalized = new Map<string, string>();

  onModuleInit(): void {
    const raw = process.env.WHATSAPP_INTEGRATIONS_JSON?.trim();
    if (!raw) {
      this.logger.warn(
        'WHATSAPP_INTEGRATIONS_JSON não definido; não haverá resolução de account_id por integração.',
      );
      return;
    }
    try {
      const rows = JSON.parse(raw) as IntegrationConfigRow[];
      if (!Array.isArray(rows)) {
        this.logger.error(
          'WHATSAPP_INTEGRATIONS_JSON deve ser um array JSON de integrações.',
        );
        return;
      }
      for (const row of rows) {
        const pid = row.phone_number_id?.trim();
        const aid = row.account_id?.trim();
        if (!pid || !aid) {
          this.logger.warn(
            'Entrada de integração ignorada: phone_number_id e account_id são obrigatórios.',
          );
          continue;
        }
        this.byPhoneNumberId.set(pid, aid);
        const disp = row.display_phone_number?.trim();
        if (disp) {
          this.byDisplayNormalized.set(this.normalizePhone(disp), aid);
        }
      }
      this.logger.log(
        `Integrações WhatsApp carregadas: ${this.byPhoneNumberId.size} por phone_number_id.`,
      );
    } catch (e) {
      this.logger.error(
        `Falha ao interpretar WHATSAPP_INTEGRATIONS_JSON: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Resolve account_id interno (camelCase) a partir dos identificadores da Meta. */
  resolveAccountId(
    phoneNumberId: string | null,
    displayPhoneNumber: string | null,
  ): string | null {
    if (phoneNumberId?.trim()) {
      const byId = this.byPhoneNumberId.get(phoneNumberId.trim());
      if (byId) {
        return byId;
      }
    }
    if (displayPhoneNumber?.trim()) {
      const byDisp = this.byDisplayNormalized.get(
        this.normalizePhone(displayPhoneNumber),
      );
      if (byDisp) {
        return byDisp;
      }
    }
    return null;
  }

  private normalizePhone(value: string): string {
    return value.replace(/\D/g, '');
  }
}

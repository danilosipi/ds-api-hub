import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';

/** Registro vindo de WHATSAPP_INTEGRATIONS_JSON (snake_case no contrato de configuração). */
export type IntegrationConfigRow = {
  provider?: string;
  phone_number_id?: string;
  account_id: string;
  display_phone_number?: string;
  instance?: string;
};

@Injectable()
export class WhatsappIntegrationRepository implements OnModuleInit {
  private readonly logger = new Logger(WhatsappIntegrationRepository.name);
  private envRows: IntegrationConfigRow[] = [];
  private dynamicRows: IntegrationConfigRow[] = [];
  private byPhoneNumberId = new Map<string, string>();
  private byDisplayNormalized = new Map<string, string>();
  private byEvolutionInstance = new Map<string, string>();

  async onModuleInit(): Promise<void> {
    this.loadEnvRows();
    await this.loadDynamicFile();
    this.rebuildMaps();
  }

  private loadEnvRows(): void {
    const raw = process.env.WHATSAPP_INTEGRATIONS_JSON?.trim();
    if (!raw) {
      this.logger.warn(
        'WHATSAPP_INTEGRATIONS_JSON não definido; só haverá mapeamento via OAuth dinâmico ou ficheiro.',
      );
      this.envRows = [];
      return;
    }
    try {
      const rows = JSON.parse(raw) as IntegrationConfigRow[];
      if (!Array.isArray(rows)) {
        this.logger.error(
          'WHATSAPP_INTEGRATIONS_JSON deve ser um array JSON de integrações.',
        );
        this.envRows = [];
        return;
      }
      this.envRows = rows.filter(
        (r) =>
          typeof r?.account_id === 'string' &&
          r.account_id.trim().length > 0 &&
          this.isValidRow(r),
      );
      this.logger.log(
        `Integrações WhatsApp (env): ${this.envRows.length} entradas.`,
      );
    } catch (e) {
      this.logger.error(
        `Falha ao interpretar WHATSAPP_INTEGRATIONS_JSON: ${e instanceof Error ? e.message : e}`,
      );
      this.envRows = [];
    }
  }

  private dynamicPath(): string | null {
    const p = process.env.WHATSAPP_INTEGRATIONS_DYNAMIC_PATH?.trim();
    return p || null;
  }

  private async loadDynamicFile(): Promise<void> {
    const path = this.dynamicPath();
    if (!path) {
      this.logger.warn(
        'WHATSAPP_INTEGRATIONS_DYNAMIC_PATH não definido; mapeamentos OAuth sobrevivem só em memória até reiniciar o processo.',
      );
      this.dynamicRows = [];
      return;
    }
    try {
      const raw = await readFile(path, 'utf8');
      const rows = JSON.parse(raw) as IntegrationConfigRow[];
      if (!Array.isArray(rows)) {
        this.logger.error(
          'Ficheiro dinâmico de integrações deve ser um array JSON.',
        );
        this.dynamicRows = [];
        return;
      }
      this.dynamicRows = rows.filter(
        (r) =>
          typeof r?.account_id === 'string' &&
          r.account_id.trim().length > 0 &&
          this.isValidRow(r),
      );
      this.logger.log(
        `Integrações WhatsApp (dinâmico): ${this.dynamicRows.length} entradas em ${path}.`,
      );
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        this.dynamicRows = [];
        return;
      }
      this.logger.error(
        `Falha ao ler WHATSAPP_INTEGRATIONS_DYNAMIC_PATH: ${err?.message ?? e}`,
      );
      this.dynamicRows = [];
    }
  }

  private rebuildMaps(): void {
    this.byPhoneNumberId.clear();
    this.byDisplayNormalized.clear();
    this.byEvolutionInstance.clear();
    const rows = [...this.envRows, ...this.dynamicRows];
    for (const row of rows) {
      const aid = row.account_id.trim();
      if (this.isEvolutionProvider(row.provider)) {
        const instance = row.instance?.trim().toLowerCase();
        if (instance) {
          this.byEvolutionInstance.set(instance, aid);
        }
        continue;
      }

      const pid = row.phone_number_id?.trim();
      if (pid) {
        this.byPhoneNumberId.set(pid, aid);
      }
      const disp = row.display_phone_number?.trim();
      if (disp) {
        this.byDisplayNormalized.set(this.normalizePhone(disp), aid);
      }
    }
  }

  /**
   * Um registo ativo whatsapp_meta por conta: remove entradas dinâmicas anteriores da mesma account_id e grava o novo par phone ↔ conta.
   */
  async upsertWhatsappMetaRouting(row: {
    account_id: string;
    phone_number_id: string;
    display_phone_number: string;
  }): Promise<void> {
    const accountId = row.account_id.trim();
    const phoneNumberId = row.phone_number_id.trim();
    const display = row.display_phone_number.trim();

    this.dynamicRows = this.dynamicRows.filter(
      (r) => r.account_id.trim() !== accountId,
    );
    this.dynamicRows.push({
      account_id: accountId,
      phone_number_id: phoneNumberId,
      display_phone_number: display,
    });
    this.rebuildMaps();
    await this.persistDynamicFile();
  }

  private async persistDynamicFile(): Promise<void> {
    const path = this.dynamicPath();
    if (!path) {
      return;
    }
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        `${JSON.stringify(this.dynamicRows, null, 2)}\n`,
        'utf8',
      );
    } catch (e) {
      this.logger.error(
        `Falha ao gravar integrações dinâmicas: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
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

  resolveEvolutionAccountId(instance: string | null): string | null {
    if (!instance?.trim()) {
      return null;
    }
    return this.byEvolutionInstance.get(instance.trim().toLowerCase()) ?? null;
  }

  private isEvolutionProvider(provider: string | undefined): boolean {
    return provider?.trim().toLowerCase() === 'evolution';
  }

  private isValidRow(row: IntegrationConfigRow): boolean {
    if (this.isEvolutionProvider(row.provider)) {
      return (
        typeof row.instance === 'string' && row.instance.trim().length > 0
      );
    }
    return (
      typeof row.phone_number_id === 'string' &&
      row.phone_number_id.trim().length > 0
    );
  }

  private normalizePhone(value: string): string {
    return value.replace(/\D/g, '');
  }
}

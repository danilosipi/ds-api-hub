# DS API Hub

Hub HTTP em [NestJS](https://nestjs.com/) que expõe webhooks do **WhatsApp Cloud API (Meta)** e **Evolution API**, e repassa eventos normalizados para um backend principal (por exemplo “Minha Agenda”), que os processa em `POST /whatsapp/webhook`.

## Estrutura do repositório

| Caminho | Descrição |
|--------|-----------|
| `repo/backend` | Aplicação NestJS (`ds-api-hub-backend`) |
| `stacks/docker-compose.yml` | Compose para subir o backend em container |

## O que este serviço faz

1. **Verificação do webhook (Meta)** — responde ao challenge do Facebook com `GET` quando o token confere.
2. **Recepção de eventos** — aceita `POST` com o payload bruto da Meta e da Evolution.
3. **Normalização e encaminhamento** — interpreta mensagens e status conhecidos e envia para o processador:

   - URL: `{PROCESSOR_API_URL}/whatsapp/webhook`
   - Corpo: `{ "source": "meta", ... }` (objeto com `kind` `message` ou `status` e o campo `data` correspondente).

Eventos não mapeados são apenas registrados em log; não são enviados ao processador.

## Requisitos

- Node.js 22+ (alinhado ao Dockerfile)
- npm

Opcional: Docker e Docker Compose para o stack em `stacks/`.

## Variáveis de ambiente

Copie o exemplo e ajuste os valores:

```bash
cp repo/backend/.env.example repo/backend/.env
```

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PROCESSOR_API_URL` | Sim (para encaminhar eventos) | URL base do backend que recebe `POST /whatsapp/webhook` (sem barra final opcional). |
| `META_WEBHOOK_VERIFY_TOKEN` | Sim (para verificação Meta) | Mesmo valor configurado no painel da Meta ao registrar o callback. |
| `PORT` | Não | Porta HTTP (padrão **3001**). |

## Executar em desenvolvimento

```bash
cd repo/backend
npm ci
npm run start:dev
```

A API sobe em `http://localhost:3001` (ou na porta definida em `PORT`), com CORS habilitado.

## Endpoints principais

| Método | Caminho | Uso |
|--------|---------|-----|
| `GET` | `/health` | Health check (`{ "status": "ok" }`). |
| `GET` | `/webhooks/whatsapp/meta` | Verificação do webhook Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`). |
| `POST` | `/webhooks/whatsapp/meta` | Recebimento dos eventos da Meta; responde `200` com `{ "received": true }`. |
| `POST` | `/webhooks/whatsapp/evolution` | Recebimento dos eventos da Evolution; responde `200` com `{ "received": true }`. |

Na Meta, a **URL de callback** deve apontar para:

`https://<seu-dominio>/webhooks/whatsapp/meta`

Na Evolution, configure o webhook para:

`https://<seu-dominio>/webhooks/whatsapp/evolution`

(usando HTTPS em produção).

## Build e produção (Node)

```bash
cd repo/backend
npm ci
npm run build
npm run start:prod
```

## Docker Compose

Na pasta `stacks`, o serviço usa o `Dockerfile` de `repo/backend` e lê `repo/backend/.env`:

```bash
cd stacks
docker compose up -d --build
```

Por padrão a porta **3001** é publicada no host (`3001:3001`).

## Stack técnica

- NestJS 11, Express, `@nestjs/axios`, `dotenv`
- TypeScript 5

---

Se o processador exigir autenticação ou um contrato de payload diferente, isso deve ser alinhado com o time do backend principal e, se necessário, estendido neste hub.

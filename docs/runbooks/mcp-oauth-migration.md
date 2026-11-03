# Runbook: migrasjon og rollback for MCP OAuth

Gjelder migrasjonen `20260730120000_add_mcp_oauth_models`.

## Før deploy

1. Ta en verifisert databasebackup.
2. Kontroller medlemskapsinvarianten:

   ```sql
   SELECT "userId", COUNT(*)
   FROM "HouseholdMember"
   GROUP BY "userId"
   HAVING COUNT(*) > 1;
   ```

   Migrasjonen stopper uten å gjøre schemaendringer dersom spørringen gir
   treff. Duplikater skal avklares og ryddes manuelt; migrasjonen velger aldri
   husstand på vegne av brukeren.

3. Kjør `pnpm --filter @workspace/db db:migrate:deploy` med produksjonens
   `DATABASE_URL`.
4. Verifiser at migrasjonen er registrert med
   `pnpm --filter @workspace/db prisma migrate status`, og at eksisterende
   webflyt fortsatt kan lese brukerens ene husstand.

## Applikasjonsrollback

Fase 2 er additiv bortsett fra den unike medlemskapsindeksen. En eldre
applikasjonsversjon kan derfor deployes uten å fjerne tabellene. Dette er den
foretrukne rollbacken: behold OAuth-radene og deaktiver MCP-konfigurasjonen.

## Databaserollback

Prisma genererer ikke nedmigrasjoner. Databaserollback skal bare brukes dersom
schemaet i seg selv må fjernes, og først etter at applikasjonen er rullet
tilbake. Eksporter OAuth-tabellene dersom tilgangene senere skal kunne
gjenopprettes. Kjør deretter følgende i én transaksjon:

```sql
BEGIN;

DROP TABLE IF EXISTS "McpOAuthRefreshToken";
DROP TABLE IF EXISTS "McpOAuthGrant";
DROP TABLE IF EXISTS "McpOAuthAuthorizationCode";
DROP TABLE IF EXISTS "McpOAuthAuthorizationRequest";
DROP TABLE IF EXISTS "McpOAuthClient";
DROP TYPE IF EXISTS "McpOAuthClientStatus";
DROP TYPE IF EXISTS "McpOAuthClientRegistrationSource";
DROP INDEX IF EXISTS "HouseholdMember_userId_key";

COMMIT;
```

Dette sletter alle OAuth-grants og refresh tokens, og kan derfor ikke angres
uten backup. Etter en databaserollback må migrasjonen markeres eller repareres
i Prisma migration history før en senere deploy. Ikke bruk
`prisma migrate reset` i produksjon.

## Revisjonsloggen (`20261103181712_add_mcp_audit_events`)

Migrasjonen er rent additiv: én ny tabell, `McpAuditEvent`, med fremmednøkler mot
`User` og `Household` (`ON DELETE CASCADE`). Den rører ingen eksisterende rader
og trenger ingen sjekk før deploy.

En eldre applikasjonsversjon fungerer med tabellen på plass; den skriver bare
ikke til den. Foretrukket rollback er derfor å rulle tilbake applikasjonen og la
tabellen stå. Skal den likevel fjernes:

```sql
DROP TABLE IF EXISTS "McpAuditEvent";
```

og marker migrasjonen som rullet tilbake:

```bash
pnpm --filter @workspace/db prisma migrate resolve \
  --rolled-back 20261103181712_add_mcp_audit_events
```

Merk: migrasjonen ble generert mot en database der `BudgetEntryCategory.id` og
`Plant.id` har en database-default som schemaet ikke beskriver. Prisma foreslo å
fjerne de to defaultene; det er tatt ut av migrasjonen fordi det ikke hører til
denne endringen og ikke har noen effekt for appen, som alltid setter ID-en selv.
Avviket vil dukke opp igjen ved neste `prisma migrate dev` og bør ryddes i en egen
migrasjon.

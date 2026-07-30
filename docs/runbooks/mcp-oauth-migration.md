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

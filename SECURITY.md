# Security policy

## Reporting a vulnerability

Please report security issues privately to **dev@backrunner.top**. Include the
affected commit, deployment configuration, reproduction steps, and expected
impact. Remove real credentials and customer data from any reproduction.

Do not open a public issue with an unpatched exploit or a secret. If GitHub
private vulnerability reporting is enabled, you may also use the repository's
**Security → Report a vulnerability** entry.

## Supported versions

OnFire is under active development. Security fixes target the latest `main`
revision; there is currently no maintained backport or LTS branch. Deployments
should track fixes and apply the accompanying database migrations.

## Deployment security

- Use separate admin and customer hostnames and explicit domain configuration.
  Follow [deployment instructions](docs/DEPLOYMENT.md) for Cloudflare Access and
  the narrowly scoped exceptions needed by OAuth/MCP clients.
- Keep `AUTH_SECRET`, provider credentials, customer tokens, database exports,
  and raw email outside Git. `AUTH_SECRET` also protects encrypted stored
  credentials: keep a secure backup and plan rotation with data migration.
- Complete the installation wizard before opening the admin hostname to users.
  The local demo accounts are only for development.
- Inline images use unguessable public URLs so email clients can display them.
  Anyone holding such a URL can retrieve the image; treat those URLs as sensitive.
- Configuring external AI, email, or notification providers sends the associated
  content to those providers. Choose routes and retention for your deployment.

Automated tests and dependency/secret scans are useful release checks, but are
not an independent security assessment of a deployment.

# Contributing to OnFire

Bug reports, documentation improvements, translations, and pull requests are
welcome. For a larger feature, open an issue describing the problem and proposed
behavior before implementing it. Use [SECURITY.md](SECURITY.md) for security issues.

## Local setup

Follow the [README](README.md#local-development). Use Node.js 22 or later and the
pnpm version pinned in `package.json`. Local seed/reset commands operate on local
D1; `pnpm db:reset` deletes existing local data.

Read [AGENTS.md](AGENTS.md), [development standards](.agents/DEVELOPMENT.md), and
the relevant [requirements](.agents/REQUIREMENTS.md). The public
[deployment guide](docs/DEPLOYMENT.md) describes the current binding layout;
older entries in the status log are historical deployment records.

## Changes and validation

Keep each pull request focused. Describe the problem, resulting behavior, and
validation. Include screenshots for visible interface changes and update English
and Chinese locale strings together. Permission changes must enforce both RBAC
and resource scope in the API.

Generate a new migration for schema changes; do not rewrite an applied migration.
Regenerate Worker types after changing bindings. Keep deployment values and
secrets out of commits, and preserve upstream copyright/license notices.

Run the same gates as CI:

```sh
pnpm install --frozen-lockfile
pnpm cf-typegen --check
pnpm lint
pnpm test
pnpm build:worker
```

For schema, binding, dependency, or deployment changes, also follow the additional
[release checks](.agents/DEVELOPMENT.md#verification-gates), including fresh local
migrations and `pnpm audit --prod`. Use a temporary D1 directory for migration
checks. Never use production resources for a pull request test.

When dependencies change, regenerate the license inventory:

```sh
node scripts/dependency-licenses.mjs
```

Commit messages use `type(scope): description`, for example
`fix(rbac): enforce product scope` or `docs(readme): clarify local setup`.

## License

By submitting a contribution, you agree to license it under the project's
[Apache License 2.0](LICENSE). Only contribute work you have the right to license.
Third-party material retains its original license and attribution.

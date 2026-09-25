# Packaging and release

The npm package build archives ESM source without compilation. The versioned
tarball contains the runtime, TypeScript declarations, examples, and maintained
docs. Tests and development scripts remain in the source repository.

From a clean source checkout, verify the code and build the installable artifact:

```text
npm run check
npm run test:coverage
npm run typecheck
npm run build
```

`npm run build` packs the source with lifecycle scripts disabled, installs and
checks that exact tarball in a clean offline consumer, and retains it at
`release/fayegram-ai-jev-adapter-VERSION.tgz`. The `release/` directory is Git-ignored.
To check that archive again, run:

```text
node scripts/package-smoke.mjs --tarball release/fayegram-ai-jev-adapter-VERSION.tgz
```

Before a public release, confirm the repository metadata, MIT copyright notice,
package contents, and CI results for the release commit. Make sure the hosted
repository has a private vulnerability-reporting route as described in
[SECURITY.md](../../SECURITY.md). Confirm that the npm login can publish under
`@fayegram-ai`. Direct publication requires account 2FA or a granular token
permitted to bypass it; see [npm's requirements](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).

Building only creates and checks the artifact; it does not publish it. The package
name and registry are `@fayegram-ai/jev-adapter` and the public npm registry.
Coordinate the GitHub source release and publication of the verified tarball to
npm as one release. Publish the verified archive with public access, replacing
`VERSION` with the package version:

```text
npm publish ./release/fayegram-ai-jev-adapter-VERSION.tgz --access public
```

The `./` prefix identifies a local archive path to npm.
The tracked `.npmrc` routes this scope to npm in this checkout without changing
the user's npm configuration. Keep credentials in the user configuration, never
in the repository. Verify the target with `npm config get @fayegram-ai:registry`
before publishing. After the coordinated release, confirm that the package page
links to the source repository and `npm install @fayegram-ai/jev-adapter` works.
Keep generated archives and verification logs outside tracked source.

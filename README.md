# Thomas Mendes portfolio

Static portfolio built with Vite and vanilla JavaScript.

**Live:** [thomas-mendes.com](https://thomas-mendes.com)

## Development

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

```sh
npm run check  # JavaScript syntax checks
npm run build  # Production output in dist/
```

Page markup is in `index.html`, styles and JavaScript in `src/`, and public assets in `public/`.

## Deployment

Pushes to `main` automatically build the site, upload it to S3 and invalidate the CloudFront cache.
The workflow can also be started manually from [GitHub Actions](https://github.com/tjzmendes10-ai/Portfolio-Website-/actions).

Required repository secrets: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
Alternatively, set the repository variable `AWS_DEPLOY_ROLE_ARN` to use an existing GitHub OIDC role.

AWS settings are in `deploy.config.json`. For manual deployments, configure AWS CLI v2 credentials, then use:

```sh
npm run deploy         # Build, provision/update hosting and publish
npm run deploy:status  # Show the current deployment
```

Hosting uses private S3 storage, CloudFront, ACM and Route 53. Credentials, build output and local deployment state are excluded from Git.

## Map data

Map geometry uses public-domain [Natural Earth data](https://www.naturalearthdata.com/about/terms-of-use/).
Source references are in `src/data/anz-map.json`; regenerate with `npm run map:generate`.

# Thomas Mendes portfolio

Frontend-only portfolio in `C:\Users\henry\Documents\repos\Portfolio-Website-`.
Source: [tjzmendes10-ai/Portfolio-Website-](https://github.com/tjzmendes10-ai/Portfolio-Website-).
A dark green and teal portfolio for enterprise sales, B2B SaaS and AI.

Live: [thomas-mendes.com](https://thomas-mendes.com) and [www.thomas-mendes.com](https://www.thomas-mendes.com).
CloudFront distribution: `E14V74KDQGNC59` (`d283itht20yd10.cloudfront.net`).

Local preview:
[127.0.0.1:5174](http://127.0.0.1:5174/). Run `npm run dev` to start it again.

## Portfolio content and interactions

- Résumé-backed sales results, career history, education and client experience.
- An organic hero network with Tom's supplied result labels, morphing on scroll into a Natural Earth ANZ coastline.
- Scroll reveals Sydney, Melbourne, Brisbane, Auckland, Perth, Adelaide, Canberra and Wellington in that order.
- City cores remain geographically anchored; connection curves sway gently and carry faint travelling pulses.
- Mobile draws one connection per city and omits travelling pulses. All motion pauses in hidden tabs.
- Reduced motion shows the final connected state without animation.
- Result counters animate once as they enter view, with final figures used for reduced motion.
- A fixed-answer chat uses Tom's exact four questions and answers, customer bubbles, a brief typing indicator and typed replies.
  There is no text input, AI/API, or backend. Native expandable answers remain as a no-JavaScript fallback.
- Selling regions, the full supplied client strip, renewals/expansion experience and an AI in practice section.
- LinkedIn, email and a downloadable copy of the original résumé at `public/Thomas-Mendes-Resume.pdf`.

Content lives in `index.html`; base responsive styling is in `src/style.css`. The quieter ANZ design is in
`src/anz-background.css`; the scroll sequence, cursor illumination and motion are in `src/anz-background.js`.
Navigation and the Sydney clock are in `src/main.js`. The page has a canonical URL, social metadata and a sitemap.
The latest responsive adjustments are in `src/portfolio-update.css`; counters and chat are in `src/portfolio-interactions.js`.

### Map provenance

The outline and city anchors derive from the public-domain [Natural Earth dataset](https://www.naturalearthdata.com/about/terms-of-use/).
Source URLs and a pinned source commit are retained in `src/data/anz-map.json`.
The map uses 1:50m country coastlines and populated-place coordinates, a Mercator projection, light simplification,
and rounded SVG curves. The frame includes mainland Australia, Tasmania, coastal islands and New Zealand's main islands;
distant overseas islands are omitted. Only Sydney is labelled. The network represents future ANZ ambitions, not past client locations.

`npm run map:generate` regenerates `src/assets/anz-outline.svg` and `src/data/anz-map.json`.
The original source datasets are cached under ignored `.deploy/natural-earth/`; they are not sent to the browser.
City timing is controlled by `thresholds`, route density by `connections`, and intensity by the SVG styles in `src/anz-background.css`.

## Hosting and deployment

- Private S3 bucket containing the Vite build.
- CloudFront distribution with Origin Access Control, HTTPS and compression.
- ACM certificate and Route 53 aliases for `thomas-mendes.com` and `www.thomas-mendes.com`.
- Direct AWS CLI provisioning and publishing. CloudFormation is not required or called.
- GitHub Actions builds and publishes pushes to `main` after AWS authentication is configured.

All resources are created in AWS account `127228002828`. The bucket is named
`thomas-mendes-portfolio-127228002828` in Sydney (`ap-southeast-2`). Certificates are requested in `us-east-1`,
as required for CloudFront. AWS resources are billed to the account.

## Local development

Node 22.12 or newer and npm are required for development. AWS CLI v2 is also required for deployments.

```powershell
npm ci
npm run dev
```

Open the address printed by Vite. Edit `index.html`, `src/main.js` and `src/style.css`.
Files in `public/` are copied into the published build, so put only approved public content there.

```powershell
npm run check
npm run build
```

`check` performs JavaScript syntax checks. No automated tests are included.

## AWS credentials

The deployment uses the normal AWS CLI credential chain: environment credentials, a local profile,
or GitHub Actions credentials. No credentials are stored in this project.
For future local deployments, configure your profile directly in the terminal:

```powershell
aws configure --profile thomas-mendes
$env:AWS_PROFILE = 'thomas-mendes'
aws sts get-caller-identity
```

Use `ap-southeast-2` and JSON output. The provisioning identity needs S3, CloudFront, ACM and Route 53 permissions.
Enabling the optional GitHub role also needs IAM permissions. Publishing content alone uses narrower permissions.

## Commands

```powershell
npm run deploy:plan
npm run deploy
npm run deploy:status
```

`deploy:plan` writes a local summary to `.deploy/plan.json` without calling AWS.
`deploy` builds the site, discovers or creates resources, validates the certificate through Route 53,
uploads the files, waits for CloudFront deployment, updates DNS and invalidates caches.
`deploy:status` reads CloudFront's current status and prints URLs without changing AWS resources.

Resource identifiers and URLs are saved in the ignored `.deploy/outputs.json`. They are also discoverable
from AWS using the configured project name, account and origin bucket, so a fresh checkout can deploy.
Keep `projectName` and `expectedAccountId` stable. A changed project name selects different resources.

`region` is the project's assigned region, currently Sydney (`ap-southeast-2`).
`certificateRegion` is separately fixed to `us-east-1` for CloudFront. New AWS project accounts restrict
regional operations to their assigned region, even with AdministratorAccess. Selecting a different S3 region
can produce an organization-policy denial. This site does not require activating advanced account features.

First certificate issuance and CloudFront provisioning can take several minutes. If interrupted,
rerun `npm run deploy` to resume with the existing bucket, certificate and distribution.
The script stops on denied AWS operations and does not change account security policies.

## Domain configuration

`deploy.config.json` is configured with:

```json
{
  "domainName": "thomas-mendes.com",
  "hostedZoneId": "Z0246504ITE2X3AQQ6LH",
  "includeWww": true
}
```

The domain and hosted zone must use the same authoritative nameservers for certificate validation.
The script adds certificate validation CNAMEs and CloudFront A/AAAA aliases. It leaves email MX/TXT records alone
and stops if the selected hostnames already point at another site.
Both the root domain and `www` serve the site; there is no redirect between them.
Domain registration and registrar nameserver changes are separate operations.

## GitHub Actions deployment

Repository: [tjzmendes10-ai/Portfolio-Website-](https://github.com/tjzmendes10-ai/Portfolio-Website-).
The workflow is `.github/workflows/deploy.yml`.

Pushes to `main` and manual runs on `main` install dependencies with `npm ci`, check JavaScript
syntax, build with Vite, upload to the existing S3 bucket and invalidate `/*` in CloudFront.
Deployment waits for cache invalidation to complete. Infrastructure, certificates and DNS are managed
separately by `npm run deploy`; Actions runs only `npm run deploy:content`.
The production concurrency group prevents overlapping deployments, and published assets are retained
so already-open pages can keep loading their versioned files. Third-party Actions are pinned to commit SHAs.

### Required repository secrets

Under [Settings → Secrets and variables → Actions](https://github.com/tjzmendes10-ai/Portfolio-Website-/settings/secrets/actions),
add these two **repository secrets** using the existing access-key pair for AWS account `127228002828`:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

The values belong only in GitHub's encrypted secret fields. Do not put them in this README, the workflow,
`deploy.config.json`, or an environment file committed to Git. No GitHub PAT or SSH deploy key is required.
The AWS identity needs permission to list/upload the portfolio bucket, list/discover the existing CloudFront
distribution, create invalidations and read their status. The supplied keys were verified against the expected account.

Both repository secrets were configured on 29 October 2026 using GitHub's encrypted secret forms.
Push to `main` to deploy, or open [Actions](https://github.com/tjzmendes10-ai/Portfolio-Website-/actions)
and run **Deploy portfolio** on `main`.

### Optional migration to temporary credentials (OIDC)

The workflow also supports an Actions **variable** named `AWS_DEPLOY_ROLE_ARN`. When present, this selects OIDC
instead of the two access-key secrets. The role trust is limited to this repository's immutable owner/repository IDs
and `refs/heads/main`. The role policy grants publishing permissions only for this site's bucket and distribution,
plus the distribution-list operation needed for discovery.

The current AWS identity is explicitly denied `iam:ListOpenIDConnectProviders` by organisation policy `p-77lmejrd`.
OIDC provisioning therefore could not finish. This denial is separate from S3 uploads and CloudFront invalidation.
An AWS administrator with the necessary allowed IAM permissions can configure the role later:

```powershell
npm run deploy:github
```

This command discovers the existing site and configures its publishing role without rebuilding, uploading content,
or changing DNS. Set the printed ARN as repository variable `AWS_DEPLOY_ROLE_ARN`; remove the access-key secrets
after verifying an OIDC deployment. Do not set the variable before its role is ready.

`deploy.config.json` already contains the repository name, numeric owner ID `349605649`, repository ID `1438305451`
and branch `main`. New repositories use these IDs in the OIDC subject:
[GitHub's immutable subject format](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims).

## Maintenance

- `public/robots.txt` permits indexing and references `public/sitemap.xml`.
- The portfolio loads Google Fonts, with local font fallbacks.
- This is a single page. Future client-side routing needs a CloudFront rewrite for deep links.
- Assets are uploaded before HTML. Old files are retained for previously opened pages; remove retired public documents explicitly.
- No resources or objects are automatically deleted. There is no teardown command.
- Keep credentials, `.env` files and `.deploy/` out of Git.

References: [CloudFront S3 access](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html),
[ACM certificate requests](https://docs.aws.amazon.com/cli/latest/reference/acm/request-certificate.html).

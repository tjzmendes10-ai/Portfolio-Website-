import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { aws, awsJson, root } from './aws.mjs';
import { bucketPolicy, cachePolicyConfig, distributionConfig, matches } from '../infra/site.mjs';
import { configureGithub } from './github.mjs';

const stateDirectory = path.join(root, '.deploy');
function jsonFile(name, value) {
  mkdirSync(stateDirectory, { recursive: true });
  const filename = path.join(stateDirectory, name);
  writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
  return `file://${filename.replaceAll('\\', '/')}`;
}

function readConfig() {
  const config = JSON.parse(readFileSync(path.join(root, 'deploy.config.json'), 'utf8'));
  if (!/^[a-z][a-z0-9-]{0,37}$/.test(config.projectName)) throw new Error('projectName must start with a lowercase letter and contain at most 38 lowercase letters, numbers or hyphens.');
  if (!/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(config.region)) throw new Error('Set region to the AWS region assigned to the project.');
  if (config.certificateRegion !== 'us-east-1') throw new Error('Keep certificateRegion as us-east-1 for the CloudFront certificate.');
  if (config.expectedAccountId && !/^\d{12}$/.test(config.expectedAccountId)) throw new Error('expectedAccountId must be a 12-digit account ID, or blank.');
  if (Boolean(config.domainName) !== Boolean(config.hostedZoneId)) throw new Error('Set domainName and hostedZoneId together, or leave both blank.');
  if (config.domainName && (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(config.domainName) || config.domainName.length > 253)) throw new Error('Use a lowercase domain without a protocol, path or trailing dot.');
  if (config.hostedZoneId && !/^Z[A-Z0-9]+$/.test(config.hostedZoneId)) throw new Error('Use the Route 53 hosted zone ID beginning with Z.');
  if (typeof config.includeWww !== 'boolean') throw new Error('includeWww must be true or false.');
  if (config.githubRepository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.githubRepository)) throw new Error('githubRepository must be owner/repository.');
  if (config.githubRepository && (!/^\d+$/.test(config.githubOwnerId) || !/^\d+$/.test(config.githubRepositoryId))) throw new Error('Set the numeric githubOwnerId and githubRepositoryId. See README.md.');
  if (config.githubRepository && !/^[A-Za-z0-9_./-]+$/.test(config.githubBranch)) throw new Error('Set a valid githubBranch.');
  if (config.githubOidcProviderArn && !/^arn:aws:iam::\d{12}:oidc-provider\/token\.actions\.githubusercontent\.com$/.test(config.githubOidcProviderArn)) throw new Error('Invalid GitHub OIDC provider ARN.');
  return config;
}

function showOutputs(outputs) {
  console.log(`\nWebsite: ${outputs.WebsiteUrl}\nCloudFront: ${outputs.CloudFrontUrl}`);
  console.log(`Bucket: ${outputs.BucketName}\nDistribution: ${outputs.DistributionId}`);
  if (outputs.GithubDeployRoleArn) console.log(`GitHub variable AWS_DEPLOY_ROLE_ARN: ${outputs.GithubDeployRoleArn}`);
}

function findDistribution(bucketDomain) {
  const result = awsJson(['cloudfront', 'list-distributions']);
  const items = (result.DistributionList?.Items || []).filter((item) => item.Origins?.Items?.some((origin) => origin.DomainName === bucketDomain));
  if (items.length > 1) throw new Error('More than one CloudFront distribution uses this bucket. Resolve the duplicate before deploying.');
  return items[0];
}

async function waitUntil(description, read, ready, timeoutMinutes = 30) {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  let nextMessage = 0;
  while (Date.now() < deadline) {
    const result = read();
    if (ready(result)) return result;
    if (Date.now() >= nextMessage) {
      console.log(`Waiting for ${description}…`);
      nextMessage = Date.now() + 60_000;
    }
    await sleep(15_000);
  }
  throw new Error(`Timed out waiting for ${description}. Rerun deployment to resume with the existing resources.`);
}

function ensureBucket(bucket, config, account) {
  try { aws(['s3api', 'head-bucket', '--bucket', bucket, '--expected-bucket-owner', account, '--region', config.region], { capture: true }); }
  catch (error) {
    if (!/\(404\)|NoSuchBucket|Not Found/.test(error.message)) throw error;
    console.log(`Creating S3 bucket ${bucket}.`);
    awsJson(['s3api', 'create-bucket', '--bucket', bucket, '--region', config.region, '--object-ownership', 'BucketOwnerEnforced',
      ...(config.region === 'us-east-1' ? [] : ['--create-bucket-configuration', `LocationConstraint=${config.region}`])]);
  }
  aws(['s3api', 'put-public-access-block', '--bucket', bucket, '--region', config.region,
    '--public-access-block-configuration', JSON.stringify({ BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true })]);
  aws(['s3api', 'put-bucket-encryption', '--bucket', bucket, '--region', config.region,
    '--server-side-encryption-configuration', JSON.stringify({ Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] })]);
  aws(['s3api', 'put-bucket-tagging', '--bucket', bucket, '--region', config.region, '--tagging', JSON.stringify({ TagSet: [{ Key: 'Project', Value: config.projectName }] })]);
}

async function ensureCertificate(config, names) {
  if (!names.length) return undefined;
  const certificates = awsJson(['acm', 'list-certificates', '--region', config.certificateRegion, '--certificate-statuses', 'ISSUED', 'PENDING_VALIDATION']);
  let arn;
  for (const item of certificates.CertificateSummaryList || []) {
    if (item.DomainName !== config.domainName) continue;
    const { Certificate } = awsJson(['acm', 'describe-certificate', '--certificate-arn', item.CertificateArn, '--region', config.certificateRegion]);
    if (names.every((name) => Certificate.SubjectAlternativeNames.includes(name))) { arn = item.CertificateArn; break; }
  }
  if (!arn) {
    console.log(`Requesting HTTPS certificate for ${names.join(', ')}.`);
    const token = createHash('sha256').update(`${config.projectName}:${names.join(',')}`).digest('hex').slice(0, 32);
    arn = awsJson(['acm', 'request-certificate', '--region', config.certificateRegion, '--domain-name', names[0],
      '--validation-method', 'DNS', '--idempotency-token', token,
      ...(names.length > 1 ? ['--subject-alternative-names', ...names.slice(1)] : []),
      '--tags', `Key=Project,Value=${config.projectName}`]).CertificateArn;
  }
  jsonFile('certificate.json', { CertificateArn: arn });
  const read = () => awsJson(['acm', 'describe-certificate', '--certificate-arn', arn, '--region', config.certificateRegion]).Certificate;
  const certificate = await waitUntil('certificate DNS validation records', read,
    (item) => item.Status === 'ISSUED' || (item.DomainValidationOptions?.length >= names.length && item.DomainValidationOptions.every((option) => option.ResourceRecord)), 5);
  if (certificate.Status !== 'ISSUED') {
    const records = [...new Map(certificate.DomainValidationOptions.map(({ ResourceRecord }) => [ResourceRecord.Name, ResourceRecord])).values()];
    awsJson(['route53', 'change-resource-record-sets', '--hosted-zone-id', config.hostedZoneId,
      '--change-batch', jsonFile('certificate-dns.json', { Changes: records.map((record) => ({
        Action: 'UPSERT', ResourceRecordSet: { Name: record.Name, Type: record.Type, TTL: 300, ResourceRecords: [{ Value: record.Value }] },
      })) })]);
    await waitUntil('HTTPS certificate issuance', read, (item) => {
      if (['FAILED', 'VALIDATION_TIMED_OUT', 'REVOKED', 'EXPIRED'].includes(item.Status)) throw new Error(`Certificate is ${item.Status}: ${item.FailureReason || ''}`);
      return item.Status === 'ISSUED';
    });
  }
  console.log('HTTPS certificate is issued.');
  return arn;
}

function ensureOriginAccess(projectName) {
  const Name = `${projectName}-origin`;
  const list = awsJson(['cloudfront', 'list-origin-access-controls']);
  const existing = list.OriginAccessControlList?.Items?.find((item) => item.Name === Name);
  if (existing) return existing.Id;
  return awsJson(['cloudfront', 'create-origin-access-control', '--origin-access-control-config', jsonFile('origin-access.json', {
    Name, OriginAccessControlOriginType: 's3', SigningBehavior: 'always', SigningProtocol: 'sigv4',
  })]).OriginAccessControl.Id;
}

function ensureCachePolicy(projectName) {
  const desired = cachePolicyConfig(`${projectName}-cache`);
  const list = awsJson(['cloudfront', 'list-cache-policies', '--type', 'custom']);
  const existing = list.CachePolicyList?.Items?.find((item) => item.CachePolicy.CachePolicyConfig.Name === desired.Name)?.CachePolicy;
  if (existing) {
    if (!matches(existing.CachePolicyConfig, desired)) {
      const policy = awsJson(['cloudfront', 'get-cache-policy', '--id', existing.Id]);
      awsJson(['cloudfront', 'update-cache-policy', '--id', existing.Id, '--if-match', policy.ETag,
        '--cache-policy-config', jsonFile('cache-policy.json', desired)]);
    }
    return existing.Id;
  }
  return awsJson(['cloudfront', 'create-cache-policy', '--cache-policy-config', jsonFile('cache-policy.json', desired)]).CachePolicy.Id;
}

function publishFiles(bucket, region) {
  console.log('Uploading versioned assets first, then the page.');
  const assets = path.join(root, 'dist', 'assets');
  if (existsSync(assets)) aws(['s3', 'sync', assets, `s3://${bucket}/assets/`, '--region', region, '--cache-control', 'public,max-age=31536000,immutable', '--only-show-errors']);
  aws(['s3', 'sync', path.join(root, 'dist'), `s3://${bucket}/`, '--region', region,
    '--exclude', 'assets/*', '--exclude', 'index.html', '--cache-control', 'public,max-age=300', '--only-show-errors']);
  aws(['s3', 'cp', path.join(root, 'dist', 'index.html'), `s3://${bucket}/index.html`, '--region', region,
    '--content-type', 'text/html; charset=utf-8', '--cache-control', 'no-cache,max-age=0,must-revalidate', '--only-show-errors']);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => !['--plan', '--content-only', '--status', '--github'].includes(arg))) throw new Error('Use --plan, --content-only, --status, --github, or no flags.');
  const mode = args[0];
  const config = readConfig();
  const names = config.domainName ? [config.domainName, ...(config.includeWww ? [`www.${config.domainName}`] : [])] : [];
  console.log(`Project: ${config.projectName} (${config.region})`);
  if (mode === '--plan') {
    jsonFile('plan.json', { Project: config.projectName, Region: config.region, CertificateRegion: config.certificateRegion, Account: config.expectedAccountId, Domains: names,
      Services: ['S3', 'CloudFront', ...(names.length ? ['ACM', 'Route53'] : [])] });
    console.log(`Domain: ${names.join(', ') || 'CloudFront address'}`);
    console.log('Direct AWS CLI deployment. Local plan saved; no AWS calls or resource changes.');
    return;
  }
  if (mode === '--github' && !config.githubRepository) throw new Error('Set the GitHub repository and numeric IDs in deploy.config.json first.');
  if (!['--status', '--github'].includes(mode) && !existsSync(path.join(root, 'dist', 'index.html'))) throw new Error('Run npm run build first, or use npm run deploy.');
  const { Account: account } = awsJson(['sts', 'get-caller-identity', '--region', config.region]);
  if (config.expectedAccountId && account !== config.expectedAccountId) throw new Error(`Wrong AWS account: expected ${config.expectedAccountId}, received ${account}.`);
  console.log(`AWS account: ${account}`);
  const bucket = `${config.projectName}-${account}`;
  const bucketDomain = `${bucket}.s3.${config.region}.amazonaws.com`;
  let distribution = findDistribution(bucketDomain);
  if (['--status', '--content-only', '--github'].includes(mode)) {
    if (!distribution) throw new Error('No distribution exists for this project. Run npm run deploy first.');
  } else {
    if (names.length) {
      const zone = awsJson(['route53', 'get-hosted-zone', '--id', config.hostedZoneId]);
      const zoneName = zone.HostedZone.Name.replace(/\.$/, '');
      if (zone.HostedZone.Config?.PrivateZone || (config.domainName !== zoneName && !config.domainName.endsWith(`.${zoneName}`))) throw new Error('Select a public hosted zone covering this domain.');
      const records = awsJson(['route53', 'list-resource-record-sets', '--hosted-zone-id', config.hostedZoneId]).ResourceRecordSets;
      const conflict = records.find((record) => names.includes(record.Name.replace(/\.$/, ''))
        && ['A', 'AAAA', 'CNAME'].includes(record.Type)
        && (!distribution || record.AliasTarget?.DNSName.replace(/\.$/, '') !== distribution.DomainName));
      if (conflict) throw new Error(`Existing ${conflict.Type} record for ${conflict.Name} belongs to another target. Resolve it before deploying.`);
    }
    ensureBucket(bucket, config, account);
    const certificateArn = await ensureCertificate(config, names);
    const originAccessId = ensureOriginAccess(config.projectName);
    const cachePolicyId = ensureCachePolicy(config.projectName);
    const desired = distributionConfig({ callerReference: `${config.projectName}-${account}`, bucketDomain, originAccessId, cachePolicyId, names, certificateArn, projectName: config.projectName });
    if (distribution) {
      const current = awsJson(['cloudfront', 'get-distribution-config', '--id', distribution.Id]);
      desired.CallerReference = current.DistributionConfig.CallerReference;
      if (!matches(current.DistributionConfig, desired)) {
        console.log('Updating CloudFront distribution.');
        distribution = awsJson(['cloudfront', 'update-distribution', '--id', distribution.Id, '--if-match', current.ETag,
          '--distribution-config', jsonFile('distribution.json', { ...current.DistributionConfig, ...desired })]).Distribution;
      }
    } else {
      console.log('Creating CloudFront distribution.');
      distribution = awsJson(['cloudfront', 'create-distribution', '--distribution-config', jsonFile('distribution.json', desired)]).Distribution;
    }
    aws(['s3api', 'put-bucket-policy', '--bucket', bucket, '--region', config.region, '--policy', jsonFile('bucket-policy.json', bucketPolicy(bucket, account, distribution.Id))]);
  }
  const outputs = {
    BucketName: bucket, DistributionId: distribution.Id,
    CloudFrontUrl: `https://${distribution.DomainName}`,
    WebsiteUrl: names.length ? `https://${config.domainName}` : `https://${distribution.DomainName}`,
  };
  if (mode === '--github') {
    outputs.GithubDeployRoleArn = configureGithub(config, outputs, account, jsonFile);
    jsonFile('outputs.json', outputs);
    showOutputs(outputs);
    console.log('\nGitHub AWS role configured. Add AWS_DEPLOY_ROLE_ARN as a repository Actions variable.');
    return;
  }
  jsonFile('outputs.json', outputs);
  if (mode === '--status') {
    console.log(`CloudFront status: ${awsJson(['cloudfront', 'get-distribution', '--id', distribution.Id]).Distribution.Status}`);
    showOutputs(outputs); return;
  }
  publishFiles(bucket, config.region);
  if (!mode) {
    await waitUntil('CloudFront deployment', () => awsJson(['cloudfront', 'get-distribution', '--id', distribution.Id]).Distribution, (item) => item.Status === 'Deployed');
    if (names.length) {
      console.log('Pointing the domain records to CloudFront.');
      const change = awsJson(['route53', 'change-resource-record-sets', '--hosted-zone-id', config.hostedZoneId,
        '--change-batch', jsonFile('site-dns.json', { Changes: names.flatMap((Name) => ['A', 'AAAA'].map((Type) => ({
          Action: 'UPSERT', ResourceRecordSet: { Name, Type, AliasTarget: { DNSName: distribution.DomainName, HostedZoneId: 'Z2FDTNDATAQYW2', EvaluateTargetHealth: false } },
        }))) })]);
      aws(['route53', 'wait', 'resource-record-sets-changed', '--id', change.ChangeInfo.Id]);
    }
  }
  const invalidation = awsJson(['cloudfront', 'create-invalidation', '--distribution-id', distribution.Id, '--paths', '/*']);
  console.log('Waiting for CloudFront cache invalidation.');
  aws(['cloudfront', 'wait', 'invalidation-completed', '--distribution-id', distribution.Id, '--id', invalidation.Invalidation.Id]);
  showOutputs(outputs);
  console.log('\nDeployment complete.');
}

try { await main(); } catch (error) {
  console.error(`\nDeployment stopped: ${error.message}`);
  process.exitCode = 1;
}

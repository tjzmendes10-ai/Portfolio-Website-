import { aws, awsJson } from './aws.mjs';

export function configureGithub(config, outputs, account, jsonFile) {
  const providerArn = config.githubOidcProviderArn || `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`;
  const providers = awsJson(['iam', 'list-open-id-connect-providers']).OpenIDConnectProviderList;
  if (!providers.some((item) => item.Arn === providerArn)) {
    if (config.githubOidcProviderArn) throw new Error('The configured GitHub OIDC provider does not exist in this account.');
    awsJson(['iam', 'create-open-id-connect-provider', '--url', 'https://token.actions.githubusercontent.com', '--client-id-list', 'sts.amazonaws.com']);
  }
  const [owner, repository] = config.githubRepository.split('/');
  const trust = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Federated: providerArn },
    Action: 'sts:AssumeRoleWithWebIdentity', Condition: { StringEquals: {
      'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      'token.actions.githubusercontent.com:sub': `repo:${owner}@${config.githubOwnerId}/${repository}@${config.githubRepositoryId}:ref:refs/heads/${config.githubBranch}`,
    } } }] };
  const roleName = `${config.projectName}-github`;
  let role;
  try { role = awsJson(['iam', 'get-role', '--role-name', roleName]).Role; }
  catch (error) { if (!error.message.includes('NoSuchEntity')) throw error; }
  if (role) aws(['iam', 'update-assume-role-policy', '--role-name', roleName, '--policy-document', jsonFile('github-trust.json', trust)]);
  else role = awsJson(['iam', 'create-role', '--role-name', roleName, '--assume-role-policy-document', jsonFile('github-trust.json', trust)]).Role;
  const policy = { Version: '2012-10-17', Statement: [
    { Effect: 'Allow', Action: ['s3:ListBucket', 's3:GetBucketLocation'], Resource: `arn:aws:s3:::${outputs.BucketName}` },
    { Effect: 'Allow', Action: ['s3:PutObject', 's3:GetObject'], Resource: `arn:aws:s3:::${outputs.BucketName}/*` },
    { Effect: 'Allow', Action: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation', 'cloudfront:GetDistribution'],
      Resource: `arn:aws:cloudfront::${account}:distribution/${outputs.DistributionId}` },
    { Effect: 'Allow', Action: 'cloudfront:ListDistributions', Resource: '*' },
  ] };
  aws(['iam', 'put-role-policy', '--role-name', roleName, '--policy-name', 'PublishPortfolio', '--policy-document', jsonFile('github-policy.json', policy)]);
  return role.Arn;
}

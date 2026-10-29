export function cachePolicyConfig(name) {
  return {
    Name: name, DefaultTTL: 300, MinTTL: 0, MaxTTL: 31536000,
    ParametersInCacheKeyAndForwardedToOrigin: {
      EnableAcceptEncodingBrotli: true, EnableAcceptEncodingGzip: true,
      CookiesConfig: { CookieBehavior: 'none' },
      HeadersConfig: { HeaderBehavior: 'none' },
      QueryStringsConfig: { QueryStringBehavior: 'none' },
    },
  };
}

export function distributionConfig({ callerReference, bucketDomain, originAccessId, cachePolicyId, names, certificateArn, projectName }) {
  return {
    CallerReference: callerReference, Comment: projectName, DefaultRootObject: 'index.html',
    Aliases: { Quantity: names.length, ...(names.length ? { Items: names } : {}) },
    Origins: { Quantity: 1, Items: [{ Id: 'portfolio', DomainName: bucketDomain,
      OriginAccessControlId: originAccessId, S3OriginConfig: { OriginAccessIdentity: '' } }] },
    DefaultCacheBehavior: {
      TargetOriginId: 'portfolio', ViewerProtocolPolicy: 'redirect-to-https',
      AllowedMethods: { Quantity: 3, Items: ['GET', 'HEAD', 'OPTIONS'], CachedMethods: { Quantity: 2, Items: ['GET', 'HEAD'] } },
      Compress: true, CachePolicyId: cachePolicyId,
    },
    Enabled: true, IsIPV6Enabled: true, HttpVersion: 'http2and3', PriceClass: 'PriceClass_100',
    ViewerCertificate: certificateArn
      ? { ACMCertificateArn: certificateArn, SSLSupportMethod: 'sni-only', MinimumProtocolVersion: 'TLSv1.2_2021' }
      : { CloudFrontDefaultCertificate: true },
  };
}

export function bucketPolicy(bucket, account, distributionId) {
  return { Version: '2012-10-17', Statement: [
    { Effect: 'Allow', Principal: { Service: 'cloudfront.amazonaws.com' }, Action: 's3:GetObject',
      Resource: `arn:aws:s3:::${bucket}/*`,
      Condition: { StringEquals: { 'AWS:SourceArn': `arn:aws:cloudfront::${account}:distribution/${distributionId}` } } },
    { Effect: 'Deny', Principal: '*', Action: 's3:*', Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`],
      Condition: { Bool: { 'aws:SecureTransport': 'false' } } },
  ] };
}

// Compare managed settings while allowing AWS to return extra default fields.
export function matches(actual, desired) {
  if (desired === null || typeof desired !== 'object') return actual === desired;
  if (actual === null || typeof actual !== 'object') return false;
  if (Array.isArray(desired) && (!Array.isArray(actual) || actual.length !== desired.length)) return false;
  return Object.entries(desired).every(([key, value]) => matches(actual[key], value));
}

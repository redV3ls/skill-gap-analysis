# CI/CD Pipeline Documentation

This directory contains GitHub Actions workflows for automated testing, security scanning, and deployment of the Clearsight IP API.

## Workflows Overview

### 1. CI/CD Pipeline (`ci.yml`)
**Triggers:** Push to main/develop, Pull requests, Manual dispatch

**Jobs:**
- **Security Scan**: Dependency vulnerability scanning with npm audit and Snyk
- **Lint**: ESLint and TypeScript compilation checks
- **Test**: Unit and integration tests with coverage reporting
- **Build**: Project build verification and wrangler.toml validation
- **Deployment Test**: Dry-run deployment testing for PRs
- **Integration Test**: Live API testing against staging/production
- **Monitoring**: Security audit and bundle size monitoring

### 2. Security Scan (`security-scan.yml`)
**Triggers:** Daily schedule (2 AM UTC), Push to main, Pull requests, Manual dispatch

**Jobs:**
- **Dependency Scan**: npm audit and Snyk vulnerability scanning
- **Code Scan**: CodeQL static analysis for security vulnerabilities
- **Secrets Scan**: TruffleHog scanning for exposed secrets
- **License Scan**: License compliance checking

### 3. Deployment Testing (`deployment-test.yml`)
**Triggers:** After successful deployment, Manual dispatch

**Jobs:**
- **Deployment Validation**: Health checks and API endpoint testing
- **Smoke Tests**: Critical functionality verification
- **Rollback Check**: Automated rollback preparation on failure

### 4. Code Quality (`code-quality.yml`)
**Triggers:** Push to main/develop, Pull requests, Weekly schedule

**Jobs:**
- **Code Quality Analysis**: ESLint SARIF output, TypeScript checks, TODO/FIXME detection
- **Dependency Analysis**: Outdated packages, unused dependencies, duplicates
- **Performance Analysis**: Bundle size monitoring, memory leak detection
- **Documentation Check**: README and API documentation validation
- **Accessibility Check**: API accessibility considerations
- **Security Headers Check**: Security header implementation verification

### 5. Deploy (`deploy.yml`)
**Triggers:** Push to main/develop, Pull requests, Manual dispatch

**Jobs:**
- **Test**: Runs test suite before deployment
- **Deploy Staging**: Deploys to staging environment (develop branch)
- **Deploy Production**: Deploys to production environment (main branch)

## Required Secrets

Configure these secrets in your GitHub repository settings:

### Cloudflare Secrets
- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with Workers:Edit permissions
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

### Security Scanning
- `SNYK_TOKEN`: Snyk authentication token for vulnerability scanning
- `CODECOV_TOKEN`: Codecov token for coverage reporting

### Environment URLs and Keys
- `STAGING_API_URL`: Staging environment API URL
- `STAGING_API_KEY`: Staging environment API key for testing
- `PRODUCTION_API_URL`: Production environment API URL
- `PRODUCTION_API_KEY`: Production environment API key for testing

## Test Configuration

### Vitest Configuration
- **Main config**: `vitest.config.ts` - Unit tests with Miniflare for Workers simulation
- **Integration config**: `vitest.integration.config.ts` - Integration tests against live APIs

### Coverage Thresholds
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

### Test Environment
- Uses Miniflare for Cloudflare Workers simulation
- Mocks D1 database with in-memory SQLite
- Mocks KV namespace with Map-based implementation

## Security Features

### Dependency Scanning
- Daily automated scans with npm audit
- Snyk integration for advanced vulnerability detection
- License compliance monitoring

### Code Security
- CodeQL static analysis for security vulnerabilities
- Secret scanning with TruffleHog
- Security header validation

### Deployment Security
- Dry-run testing for pull requests
- Health checks and smoke tests after deployment
- Automated rollback preparation on failure

## Performance Monitoring

### Bundle Size Monitoring
- Tracks build output size
- Alerts on size threshold violations
- Memory leak pattern detection

### API Performance
- Response time monitoring during deployment tests
- Load testing with multiple concurrent requests
- Performance regression detection

## Failure Handling

### Automated Responses
- Creates GitHub issues for deployment failures
- Generates rollback instructions
- Uploads diagnostic artifacts

### Rollback Process
1. Automatic rollback instructions generation
2. Previous deployment state preservation
3. Manual rollback commands provided
4. Post-rollback verification steps

## Usage Examples

### Running Tests Locally
```bash
# Unit tests
npm run test

# Tests with coverage
npm run test:coverage

# Integration tests
npm run test:integration

# Security tests
npm run test:security
```

### Manual Deployment
```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production

# Dry run deployment
npx wrangler deploy --dry-run
```

### Security Scanning
```bash
# Run npm audit
npm audit

# Check for outdated packages
npm outdated

# License check
npx license-checker
```

## Troubleshooting

### Common Issues

1. **Test Failures**: Check Miniflare configuration and mock setup
2. **Deployment Failures**: Verify Cloudflare secrets and wrangler.toml
3. **Security Scan Failures**: Review dependency vulnerabilities and update packages
4. **Coverage Failures**: Ensure test coverage meets thresholds

### Debug Commands
```bash
# Validate wrangler configuration
npx wrangler validate

# Check environment variables
npx wrangler secret list

# Test local development
npm run dev
```

## Maintenance

### Regular Tasks
- Review and update dependency versions
- Monitor security scan results
- Update coverage thresholds as needed
- Review and clean up old workflow runs

### Quarterly Reviews
- Evaluate workflow performance
- Update security scanning tools
- Review and update documentation
- Assess test coverage and quality

## Contributing

When adding new workflows or modifying existing ones:

1. Test workflows in a fork first
2. Update this documentation
3. Ensure all required secrets are documented
4. Add appropriate error handling
5. Include rollback procedures for deployment changes
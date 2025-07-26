# Setup Guide

## Step-by-Step Setup for Cloudflare Workers

### 1. Prerequisites
```bash
# Install Node.js 18+ and npm
# Install Wrangler globally (optional)
npm install -g wrangler

# Or use the local version
npm install
```

### 2. Authentication
```bash
npm run cf:login
# This will open your browser to authenticate with Cloudflare
```

### 3. Create Cloudflare Resources

#### Create D1 Database
```bash
wrangler d1 create skill-gap-db
```

**Copy the output and update `wrangler.toml`:**
- Replace `replace-with-your-d1-database-id` with the actual database ID

#### Create KV Namespaces
```bash
wrangler kv namespace create "CACHE"
wrangler kv namespace create "CACHE" --preview
```

**Copy the output and update `wrangler.toml`:**
- Replace `replace-with-your-kv-namespace-id` with the production namespace ID
- Replace `replace-with-your-preview-kv-namespace-id` with the preview namespace ID

### 4. Set Environment Secrets
```bash
wrangler secret put JWT_SECRET
# Enter a secure random string (e.g., use a password generator for 64+ characters)
```

### 5. Database Setup
```bash
# Generate database schema
npm run db:generate

# Apply migrations to D1
npm run db:migrate
```

### 6. Test Local Development
```bash
npm run dev
```

Visit `http://localhost:8787/health` to test the API.

### 7. Deploy
```bash
# Deploy to production
npm run deploy

# Or deploy to staging (if you set up staging environment)
npm run deploy:staging
```

## GitHub Setup

### 1. Create Repository
```bash
git init
git add .
git commit -m "Initial commit: Skill Gap Analysis API"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/clearsight-ip.git
git push -u origin main
```

### 2. Create Development Branch
```bash
git checkout -b develop
git push -u origin develop
```

### 3. Set GitHub Secrets
Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these repository secrets:
- `CLOUDFLARE_API_TOKEN`: Get from Cloudflare Dashboard → My Profile → API Tokens
- `CLOUDFLARE_ACCOUNT_ID`: Get from Cloudflare Dashboard → Right sidebar

### 4. Automatic Deployments
- Push to `develop` branch → deploys to staging
- Push to `main` branch → deploys to production

## Troubleshooting

### Common Issues

1. **"Unknown arguments" error with Wrangler**
   - Make sure you're using the latest Wrangler version
   - Use `wrangler kv namespace create` not `wrangler kv:namespace create`

2. **Database migration fails**
   - Ensure your D1 database ID is correct in `wrangler.toml`
   - Run `wrangler d1 list` to see your databases

3. **Authentication issues**
   - Run `npm run cf:whoami` to check if you're logged in
   - Re-run `npm run cf:login` if needed

4. **Local development not working**
   - Check that all IDs in `wrangler.toml` are correct
   - Ensure secrets are set with `wrangler secret list`

### Useful Commands
```bash
# Check authentication
npm run cf:whoami

# List D1 databases
wrangler d1 list

# List KV namespaces
wrangler kv namespace list

# List secrets
wrangler secret list

# View logs
wrangler tail

# Delete resources (be careful!)
wrangler d1 delete skill-gap-db
wrangler kv namespace delete --namespace-id YOUR_NAMESPACE_ID
```
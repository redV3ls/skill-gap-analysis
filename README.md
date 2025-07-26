# Clearsight IP API

A comprehensive RESTful API service built on Cloudflare Workers that analyzes skill gaps between individuals' current capabilities and job requirements, providing actionable insights and learning recommendations.

## Features

- **Skill Gap Analysis**: Compare user skills against job requirements
- **Team Analysis**: Assess collective team capabilities
- **Industry Trends**: Access skill demand forecasting and market insights
- **Learning Recommendations**: Get personalized learning paths and resources
- **Progress Tracking**: Monitor skill development over time
- **Global Edge Deployment**: Powered by Cloudflare Workers for worldwide low latency
- **Serverless Architecture**: Auto-scaling with zero cold starts

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono.js (lightweight web framework)
- **Database**: Cloudflare D1 (SQLite-based)
- **Cache**: Cloudflare KV
- **Rate Limiting**: Durable Objects
- **ORM**: Drizzle ORM
- **CI/CD**: GitHub Actions
- **Deployment**: Wrangler CLI

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI installed globally: `npm install -g wrangler`

### Local Development

1. **Clone and install dependencies**
   ```bash
   git clone <your-repo-url>
   cd clearsight-ip
   npm install
   ```

2. **Authenticate with Cloudflare**
   ```bash
   npm run cf:login
   ```

3. **Create D1 database**
   ```bash
   wrangler d1 create skill-gap-db
   ```
   Update the `database_id` in `wrangler.toml` with the returned ID.

4. **Create KV namespace**
   ```bash
   wrangler kv namespace create "CACHE"
   wrangler kv namespace create "CACHE" --preview
   ```
   Update the KV namespace IDs in `wrangler.toml`.

5. **Set up environment secrets**
   ```bash
   wrangler secret put JWT_SECRET
   # Enter a secure JWT secret when prompted
   ```

6. **Run database migrations**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

7. **Start development server**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:8787`

## Deployment

### GitHub Setup

1. **Create GitHub repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Set up GitHub Secrets**
   Go to your GitHub repository → Settings → Secrets and variables → Actions
   
   Add these secrets:
   - `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
   - `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

3. **Create development branch**
   ```bash
   git checkout -b develop
   git push -u origin develop
   ```

### Cloudflare Deployment

#### Manual Deployment
```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy
```

#### Automatic Deployment
- Push to `develop` branch → deploys to staging
- Push to `main` branch → deploys to production

### Environment Configuration

Set these variables in Cloudflare Dashboard or via Wrangler:

```bash
# Production secrets
wrangler secret put JWT_SECRET --env production
wrangler secret put DATABASE_URL --env production  # if using external DB

# Staging secrets
wrangler secret put JWT_SECRET --env staging
```

## API Documentation

### Base URLs
- **Production**: `https://clearsight-ip-api.your-subdomain.workers.dev`
- **Staging**: `https://clearsight-ip-api-staging.your-subdomain.workers.dev`

### Health Checks

- `GET /health` - Basic health status
- `GET /health/detailed` - Detailed health with dependencies
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

### Authentication

All API endpoints require authentication via:
- **API Key**: Include `X-API-Key` header
- **JWT Token**: Include `Authorization: Bearer <token>` header

### Core Endpoints

- `GET /api/v1` - API information and available endpoints
- `POST /api/v1/analyze/gap` - Individual skill gap analysis (coming soon)
- `POST /api/v1/analyze/team` - Team skill gap analysis (coming soon)
- `GET /api/v1/trends/industry/{id}` - Industry skill trends (coming soon)

## Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run deploy       # Deploy to production
npm run deploy:staging # Deploy to staging
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Lint code
npm run lint:fix     # Fix linting issues
npm run db:generate  # Generate database migrations
npm run db:migrate   # Apply database migrations
npm run db:studio    # Open Drizzle Studio
```

### Project Structure

```
src/
├── db/              # Database schema and migrations
├── middleware/      # Hono middleware (auth, rate limiting, errors)
├── routes/          # API route handlers
├── services/        # Business logic services (coming soon)
├── utils/           # Utility functions (coming soon)
└── index.ts         # Main application entry point
```

### Database Schema

The API uses Cloudflare D1 (SQLite) with Drizzle ORM. Key entities:

- **Users & Profiles**: User accounts and skill profiles
- **Skills**: Comprehensive skills taxonomy
- **Jobs**: Job requirements and skill mappings
- **Gap Analysis**: Analysis results and recommendations
- **Industry Trends**: Market data and forecasting

### Rate Limiting

Built-in rate limiting using Cloudflare Durable Objects:
- 100 requests per 15-minute window (configurable)
- Per-IP tracking with automatic cleanup
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Monitoring

Cloudflare provides built-in monitoring:
- Real-time analytics in Cloudflare Dashboard
- Error tracking and logging
- Performance metrics
- Geographic distribution stats

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Run the test suite (`npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## License

MIT License - see LICENSE file for details.

## Support

- 📧 Email: support@your-domain.com
- 📖 Documentation: [API Docs](https://your-api-docs-url.com)
- 🐛 Issues: [GitHub Issues](https://github.com/your-username/clearsight-ip/issues)
---


## 🚀 **DEPLOYMENT STATUS: LIVE**

**✅ Successfully deployed to Cloudflare Workers!**

**🌐 Live API URL:** https://clearsight-ip-api.vchernev93.workers.dev

### **Test the Live API:**

```bash
# Health check
curl https://clearsight-ip-api.vchernev93.workers.dev/health

# Detailed health check (includes database and cache status)
curl https://clearsight-ip-api.vchernev93.workers.dev/health/detailed

# API information and available endpoints
curl https://clearsight-ip-api.vchernev93.workers.dev/api/v1

# Root endpoint
curl https://clearsight-ip-api.vchernev93.workers.dev/
```

### **Infrastructure Status:**
- ✅ **Cloudflare Workers**: Deployed and running
- ✅ **D1 Database**: Connected and healthy (ID: 96482268-37bf-4082-bacd-18509c947738)
- ✅ **KV Cache**: Connected and healthy (ID: 747058b5407243d9846eb3ca1d6ef563)
- ✅ **Database Schema**: 10 tables migrated successfully
- ✅ **JWT Authentication**: Configured and ready
- ✅ **CORS**: Enabled for cross-origin requests
- ✅ **Security Headers**: Applied via Hono middleware

### **Next Steps for GitHub Integration:**

1. **Create GitHub Repository:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Skill Gap Analysis API deployed to Cloudflare Workers"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/clearsight-ip.git
   git push -u origin main
   ```

2. **Set up GitHub Secrets for CI/CD:**
   - Go to GitHub repository → Settings → Secrets and variables → Actions
   - Add: `CLOUDFLARE_API_TOKEN` (get from Cloudflare Dashboard)
   - Add: `CLOUDFLARE_ACCOUNT_ID`: `deb9c07fca62a2618804fb62ffdd336d`

3. **Automatic Deployments:**
   - Push to `main` branch → deploys to production
   - Push to `develop` branch → deploys to staging (when configured)

The API is now live and ready for development! 🎉
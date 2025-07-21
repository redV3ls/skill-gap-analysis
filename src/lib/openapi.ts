import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { Env } from '../index';

export function createOpenAPIApp() {
  const app = new OpenAPIHono<{ Bindings: Env }>();

  // OpenAPI documentation configuration
  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: 'Skill Gap Analysis API',
      version: '1.0.0',
      description: `
# Skill Gap Analysis API

A comprehensive API for analyzing skill gaps, tracking professional development, and providing insights for career growth.

## Key Features

- **Skill Gap Analysis**: Compare current skills against job requirements
- **Team Analysis**: Analyze team capabilities and identify skill gaps
- **Industry Trends**: Track emerging and declining skills in various industries
- **User Profiles**: Manage user skills and track progression
- **GDPR Compliance**: Data export, retention, and deletion features
- **Async Processing**: Handle large-scale analyses with job queuing
- **Caching**: High-performance caching for optimal response times

## Authentication

The API uses JWT-based authentication. Include the token in the Authorization header:

\`\`\`
Authorization: Bearer YOUR_JWT_TOKEN
\`\`\`

API keys are also supported for service-to-service communication:

\`\`\`
X-API-Key: YOUR_API_KEY
\`\`\`

## Rate Limiting

- Default: 100 requests per 15 minutes per IP
- Authenticated users: 500 requests per 15 minutes
- API keys: Configurable based on tier

## Versioning

The API uses URL-based versioning. Current version: v1

All endpoints are prefixed with \`/api/v1\`

## Response Format

All responses follow a consistent format:

\`\`\`json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-20T10:30:00Z",
    "version": "1.0.0"
  }
}
\`\`\`

Error responses:

\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  }
}
\`\`\`
      `,
      termsOfService: 'https://example.com/terms',
      contact: {
        name: 'API Support',
        url: 'https://example.com/support',
        email: 'api@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:8787',
        description: 'Local development server'
      },
      {
        url: 'https://api.skillgap.example.com',
        description: 'Production server'
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization endpoints'
      },
      {
        name: 'Analysis',
        description: 'Skill gap and team analysis endpoints'
      },
      {
        name: 'Users',
        description: 'User profile and skill management'
      },
      {
        name: 'Trends',
        description: 'Industry trends and skill insights'
      },
      {
        name: 'Jobs',
        description: 'Asynchronous job processing'
      },
      {
        name: 'GDPR',
        description: 'Data privacy and compliance endpoints'
      },
      {
        name: 'Audit',
        description: 'Audit logging and compliance tracking'
      },
      {
        name: 'Monitoring',
        description: 'System monitoring and health checks'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT authentication token'
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for service-to-service communication'
        }
      },
      schemas: {
        Error: z.object({
          success: z.literal(false),
          error: z.object({
            code: z.string(),
            message: z.string(),
            details: z.any().optional()
          })
        }),
        SuccessResponse: z.object({
          success: z.literal(true),
          data: z.any(),
          meta: z.object({
            timestamp: z.string().datetime(),
            version: z.string()
          }).optional()
        }),
        PaginationMeta: z.object({
          page: z.number().int().positive(),
          limit: z.number().int().positive(),
          total: z.number().int().nonnegative(),
          totalPages: z.number().int().nonnegative()
        }),
        Skill: z.object({
          id: z.string(),
          name: z.string(),
          category: z.string(),
          level: z.number().min(1).max(5),
          yearsOfExperience: z.number().optional(),
          lastUsed: z.string().datetime().optional(),
          verified: z.boolean().optional()
        }),
        User: z.object({
          id: z.string(),
          email: z.string().email(),
          name: z.string().optional(),
          role: z.enum(['user', 'admin']),
          createdAt: z.string().datetime(),
          updatedAt: z.string().datetime()
        }),
        GapAnalysisResult: z.object({
          overallMatch: z.number().min(0).max(100),
          gaps: z.array(z.object({
            skill: z.string(),
            required: z.number(),
            current: z.number(),
            gap: z.number(),
            priority: z.enum(['high', 'medium', 'low'])
          })),
          recommendations: z.array(z.object({
            skill: z.string(),
            description: z.string(),
            resources: z.array(z.string()).optional()
          })),
          strengths: z.array(z.string())
        })
      }
    }
  });

  // Add Swagger UI
  app.get('/api/v1/docs', swaggerUI({ 
    url: '/openapi.json',
    documentTitle: 'Skill Gap Analysis API Documentation',
    persistAuthorization: true
  }));

  // Redirect /api/v1/docs/ to /api/v1/docs
  app.get('/api/v1/docs/', (c) => c.redirect('/api/v1/docs'));

  return app;
}

// Helper function to create typed routes
export function createTypedRoute<TPath extends string, TMethod extends string>(
  config: Parameters<typeof createRoute>[0]
) {
  return createRoute(config);
}

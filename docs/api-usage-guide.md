# Skill Gap Analysis API - Usage Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [Common Use Cases](#common-use-cases)
4. [Code Examples](#code-examples)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)

## Getting Started

### Base URL

```
Production: https://api.skillgap.example.com
Development: http://localhost:8787
```

### API Version

Current version: `v1`

All endpoints are prefixed with `/api/v1`

### Quick Start

1. Register an account
2. Get your authentication token
3. Make your first API call

```bash
# 1. Register
curl -X POST https://api.skillgap.example.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "name": "John Doe"
  }'

# 2. Response includes token
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { ... }
}

# 3. Use token for authenticated requests
curl -X GET https://api.skillgap.example.com/api/v1/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

## Authentication

### JWT Token Authentication

The API uses JWT (JSON Web Tokens) for authentication. Tokens expire after 1 hour.

#### Login

```javascript
// JavaScript/Node.js Example
const response = await fetch('https://api.skillgap.example.com/api/v1/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'yourpassword'
  })
});

const data = await response.json();
const token = data.token;
const refreshToken = data.refreshToken;

// Store tokens securely
localStorage.setItem('authToken', token);
localStorage.setItem('refreshToken', refreshToken);
```

#### Using the Token

```javascript
// Include token in all authenticated requests
const response = await fetch('https://api.skillgap.example.com/api/v1/users/profile', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

#### Refreshing Tokens

```javascript
// Refresh when token expires
const refreshResponse = await fetch('https://api.skillgap.example.com/api/v1/auth/refresh', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    refreshToken: localStorage.getItem('refreshToken')
  })
});

const newTokens = await refreshResponse.json();
localStorage.setItem('authToken', newTokens.token);
localStorage.setItem('refreshToken', newTokens.refreshToken);
```

### API Key Authentication

For service-to-service communication or automation:

```bash
# Create an API key
curl -X POST https://api.skillgap.example.com/api/v1/auth/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI/CD Pipeline",
    "scopes": ["read:profile", "write:skills"],
    "expiresIn": 31536000
  }'

# Use API key
curl -X GET https://api.skillgap.example.com/api/v1/users/profile \
  -H "X-API-Key: sk_live_abcdef123456..."
```

## Common Use Cases

### 1. Individual Skill Gap Analysis

**Use Case**: Analyze skill gaps for a specific job position

```javascript
async function analyzeSkillGap(targetRole, currentSkills) {
  const response = await fetch('https://api.skillgap.example.com/api/v1/analyze/gap', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      targetRole: targetRole,
      currentSkills: currentSkills,
      includeRecommendations: true
    })
  });

  const result = await response.json();
  return result.data;
}

// Example usage
const analysis = await analyzeSkillGap(
  'Senior Frontend Developer',
  [
    { skill: 'JavaScript', level: 4 },
    { skill: 'React', level: 3 },
    { skill: 'CSS', level: 4 },
    { skill: 'TypeScript', level: 2 }
  ]
);

console.log(`Overall Match: ${analysis.overallMatch}%`);
console.log('Skill Gaps:', analysis.gaps);
console.log('Recommendations:', analysis.recommendations);
```

### 2. Team Skills Analysis

**Use Case**: Analyze team capabilities and identify collective gaps

```python
# Python Example
import requests
import json

def analyze_team_skills(team_members, target_capabilities):
    url = "https://api.skillgap.example.com/api/v1/analyze/team"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "teamMembers": team_members,
        "targetCapabilities": target_capabilities,
        "analysisType": "comprehensive"
    }
    
    response = requests.post(url, headers=headers, json=payload)
    return response.json()

# Example usage
team_data = [
    {
        "id": "member1",
        "name": "Alice",
        "skills": [
            {"skill": "Python", "level": 5},
            {"skill": "Machine Learning", "level": 4}
        ]
    },
    {
        "id": "member2",
        "name": "Bob",
        "skills": [
            {"skill": "Java", "level": 4},
            {"skill": "Spring Boot", "level": 3}
        ]
    }
]

target = ["Python", "Java", "Machine Learning", "DevOps", "Cloud Architecture"]

result = analyze_team_skills(team_data, target)
print(f"Team Coverage: {result['data']['coverage']}%")
print(f"Critical Gaps: {result['data']['criticalGaps']}")
```

### 3. Track Skill Progression

**Use Case**: Update and track skill development over time

```typescript
// TypeScript Example
interface Skill {
  skill: string;
  level: number;
  yearsOfExperience?: number;
}

class SkillTracker {
  private apiUrl = 'https://api.skillgap.example.com/api/v1';
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async updateSkills(skills: Skill[]): Promise<void> {
    const response = await fetch(`${this.apiUrl}/users/profile/skills`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ skills })
    });

    if (!response.ok) {
      throw new Error('Failed to update skills');
    }
  }

  async getSkillHistory(): Promise<any> {
    const response = await fetch(`${this.apiUrl}/users/profile/skills/history`, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    return response.json();
  }
}

// Usage
const tracker = new SkillTracker(authToken);

// Update current skills
await tracker.updateSkills([
  { skill: 'React', level: 4, yearsOfExperience: 3 },
  { skill: 'Node.js', level: 3, yearsOfExperience: 2 }
]);

// Get progression history
const history = await tracker.getSkillHistory();
console.log('Skill progression:', history.data);
```

### 4. Industry Trends Analysis

**Use Case**: Get insights on trending skills in your industry

```ruby
# Ruby Example
require 'net/http'
require 'json'

class IndustryTrends
  BASE_URL = 'https://api.skillgap.example.com/api/v1'
  
  def initialize(token)
    @token = token
  end
  
  def get_emerging_skills(industry_id, options = {})
    uri = URI("#{BASE_URL}/trends/skills/emerging")
    uri.query = URI.encode_www_form({
      industry: industry_id,
      limit: options[:limit] || 10,
      timeframe: options[:timeframe] || '6months'
    })
    
    request = Net::HTTP::Get.new(uri)
    request['Authorization'] = "Bearer #{@token}"
    
    response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
      http.request(request)
    end
    
    JSON.parse(response.body)
  end
  
  def forecast_skill_demand(skill, years = 2)
    uri = URI("#{BASE_URL}/trends/forecast")
    request = Net::HTTP::Post.new(uri)
    request['Authorization'] = "Bearer #{@token}"
    request['Content-Type'] = 'application/json'
    request.body = {
      skill: skill,
      forecastYears: years,
      includeFactors: true
    }.to_json
    
    response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
      http.request(request)
    end
    
    JSON.parse(response.body)
  end
end

# Usage
trends = IndustryTrends.new(auth_token)

# Get emerging skills in tech industry
emerging = trends.get_emerging_skills('technology', limit: 20)
puts "Top emerging skills: #{emerging['data']['skills']}"

# Forecast demand for a specific skill
forecast = trends.forecast_skill_demand('Artificial Intelligence', 3)
puts "AI demand forecast: #{forecast['data']['forecast']}"
```

### 5. Asynchronous Bulk Analysis

**Use Case**: Process large-scale team or organizational skill analysis

```go
// Go Example
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type JobClient struct {
    BaseURL string
    Token   string
}

func (c *JobClient) SubmitBulkAnalysis(data interface{}) (string, error) {
    url := fmt.Sprintf("%s/jobs/bulk-import", c.BaseURL)
    
    jsonData, err := json.Marshal(map[string]interface{}{
        "type": "skill_analysis",
        "data": data,
        "options": map[string]interface{}{
            "generateReport": true,
            "emailNotification": true,
        },
    })
    if err != nil {
        return "", err
    }
    
    req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
    if err != nil {
        return "", err
    }
    
    req.Header.Set("Authorization", "Bearer "+c.Token)
    req.Header.Set("Content-Type", "application/json")
    
    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()
    
    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    
    return result["data"].(map[string]interface{})["jobId"].(string), nil
}

func (c *JobClient) CheckJobStatus(jobId string) (string, error) {
    url := fmt.Sprintf("%s/jobs/%s", c.BaseURL, jobId)
    
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return "", err
    }
    
    req.Header.Set("Authorization", "Bearer "+c.Token)
    
    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()
    
    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    
    return result["data"].(map[string]interface{})["status"].(string), nil
}

// Usage
func main() {
    client := &JobClient{
        BaseURL: "https://api.skillgap.example.com/api/v1",
        Token:   "your-auth-token",
    }
    
    // Submit bulk analysis
    jobId, err := client.SubmitBulkAnalysis(largeDataset)
    if err != nil {
        panic(err)
    }
    
    fmt.Printf("Job submitted: %s\n", jobId)
    
    // Poll for completion
    for {
        status, err := client.CheckJobStatus(jobId)
        if err != nil {
            panic(err)
        }
        
        fmt.Printf("Job status: %s\n", status)
        
        if status == "completed" || status == "failed" {
            break
        }
        
        time.Sleep(5 * time.Second)
    }
}
```

## Code Examples

### Full SDK Example (JavaScript/TypeScript)

```typescript
// skillgap-sdk.ts
export class SkillGapSDK {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = 'https://api.skillgap.example.com/api/v1') {
    this.baseUrl = baseUrl;
  }

  async authenticate(email: string, password: string): Promise<void> {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    this.token = response.token;
  }

  async analyzeGap(targetRole: string, currentSkills: any[]): Promise<any> {
    return this.request('/analyze/gap', {
      method: 'POST',
      body: JSON.stringify({ targetRole, currentSkills })
    });
  }

  async getProfile(): Promise<any> {
    return this.request('/users/profile');
  }

  async updateSkills(skills: any[]): Promise<any> {
    return this.request('/users/profile/skills', {
      method: 'PUT',
      body: JSON.stringify({ skills })
    });
  }

  async exportData(format: 'json' | 'csv' = 'json'): Promise<any> {
    return this.request('/gdpr/export', {
      method: 'POST',
      body: JSON.stringify({ format, categories: ['all'] })
    });
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    return data.data || data;
  }
}

// Usage example
async function main() {
  const sdk = new SkillGapSDK();
  
  // Authenticate
  await sdk.authenticate('user@example.com', 'password');
  
  // Get profile
  const profile = await sdk.getProfile();
  console.log('User profile:', profile);
  
  // Analyze skill gap
  const analysis = await sdk.analyzeGap('Full Stack Developer', [
    { skill: 'JavaScript', level: 4 },
    { skill: 'Python', level: 3 },
    { skill: 'Docker', level: 2 }
  ]);
  
  console.log('Gap analysis:', analysis);
  
  // Export data for GDPR compliance
  const exportRequest = await sdk.exportData('json');
  console.log('Export requested:', exportRequest.exportId);
}

main().catch(console.error);
```

### Error Handling Example

```javascript
class APIError extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function safeAPICall(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error.response) {
      const data = await error.response.json();
      throw new APIError(
        data.error?.message || 'Unknown error',
        data.error?.code || 'UNKNOWN',
        data.error?.details
      );
    }
    throw error;
  }
}

// Usage
try {
  const result = await safeAPICall(() => 
    sdk.analyzeGap('Invalid Role', [])
  );
} catch (error) {
  if (error instanceof APIError) {
    console.error(`API Error ${error.code}: ${error.message}`);
    if (error.details) {
      console.error('Details:', error.details);
    }
  }
}
```

## Best Practices

### 1. Rate Limiting

Implement exponential backoff for rate limit handling:

```javascript
async function withRetry(fn, maxRetries = 3) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers.get('Retry-After') || 60;
        const delay = (parseInt(retryAfter) * 1000) * Math.pow(2, i);
        
        console.log(`Rate limited. Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  
  throw lastError;
}
```

### 2. Caching

Implement client-side caching for frequently accessed data:

```javascript
class CachedAPI {
  constructor(ttl = 300000) { // 5 minutes default
    this.cache = new Map();
    this.ttl = ttl;
  }

  async get(key, fetchFn) {
    const cached = this.cache.get(key);
    
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    
    const data = await fetchFn();
    this.cache.set(key, {
      data,
      expires: Date.now() + this.ttl
    });
    
    return data;
  }

  invalidate(key) {
    this.cache.delete(key);
  }
}

// Usage
const cache = new CachedAPI();
const trends = await cache.get('emerging-skills', () => 
  sdk.getTrends('emerging')
);
```

### 3. Batch Operations

Optimize multiple operations:

```javascript
class BatchProcessor {
  constructor(sdk, batchSize = 50) {
    this.sdk = sdk;
    this.batchSize = batchSize;
  }

  async updateMultipleSkills(skillUpdates) {
    const batches = [];
    
    for (let i = 0; i < skillUpdates.length; i += this.batchSize) {
      batches.push(skillUpdates.slice(i, i + this.batchSize));
    }
    
    const results = [];
    for (const batch of batches) {
      const result = await this.sdk.updateSkills(batch);
      results.push(result);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }
}
```

### 4. Security Best Practices

- Never expose tokens in client-side code
- Use environment variables for sensitive data
- Implement token refresh logic
- Use HTTPS for all API calls
- Validate all input data

```javascript
// Secure token storage example
class SecureTokenManager {
  constructor() {
    this.tokenKey = 'skillgap_auth_token';
    this.refreshKey = 'skillgap_refresh_token';
  }

  saveTokens(token, refreshToken) {
    // In browser: use httpOnly cookies or secure storage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(this.tokenKey, token);
      localStorage.setItem(this.refreshKey, refreshToken);
    } else {
      // In Node.js: use environment variables or secure key management
      process.env.AUTH_TOKEN = token;
      process.env.REFRESH_TOKEN = refreshToken;
    }
  }

  getToken() {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(this.tokenKey);
    }
    return process.env.AUTH_TOKEN;
  }

  clearTokens() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.refreshKey);
    } else {
      delete process.env.AUTH_TOKEN;
      delete process.env.REFRESH_TOKEN;
    }
  }
}
```

## Troubleshooting

### Common Issues

#### 401 Unauthorized

```javascript
// Check if token is expired
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

// Auto-refresh if expired
async function authenticatedRequest(url, options) {
  let token = getStoredToken();
  
  if (isTokenExpired(token)) {
    token = await refreshAuthToken();
  }
  
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });
}
```

#### 429 Too Many Requests

```javascript
// Implement request queue
class RequestQueue {
  constructor(maxConcurrent = 5, minDelay = 100) {
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = maxConcurrent;
    this.minDelay = minDelay;
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      setTimeout(() => this.process(), this.minDelay);
    }
  }
}
```

#### Debugging API Calls

```javascript
// Request/Response logger
function createAPILogger() {
  return {
    logRequest: (method, url, data) => {
      console.group(`🚀 API Request: ${method} ${url}`);
      console.log('Data:', data);
      console.log('Timestamp:', new Date().toISOString());
      console.groupEnd();
    },
    
    logResponse: (status, data, duration) => {
      const emoji = status < 400 ? '✅' : '❌';
      console.group(`${emoji} API Response: ${status}`);
      console.log('Data:', data);
      console.log('Duration:', `${duration}ms`);
      console.groupEnd();
    },
    
    logError: (error) => {
      console.group('❌ API Error');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.groupEnd();
    }
  };
}

// Usage
const logger = createAPILogger();
const startTime = Date.now();

try {
  logger.logRequest('POST', '/api/v1/analyze/gap', requestData);
  const response = await fetch(url, options);
  const data = await response.json();
  logger.logResponse(response.status, data, Date.now() - startTime);
  return data;
} catch (error) {
  logger.logError(error);
  throw error;
}
```

### Support

For additional help:

- Check the [API Documentation](https://api.skillgap.example.com/api/v1/docs)
- Review [Common Error Codes](./error-codes.md)
- Contact support: api@example.com
- Join our [Developer Community](https://community.example.com)

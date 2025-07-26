import { jest } from '@jest/globals';
import { drizzle } from 'drizzle-orm/d1';

// Mock D1 prepared statement that works with Drizzle ORM
export class MockD1PreparedStatement {
  private query: string;
  private mockResponses: Map<string, any>;
  private boundParams: any[] = [];

  constructor(query: string, mockResponses: Map<string, any>) {
    this.query = query;
    this.mockResponses = mockResponses;
  }

  bind(...params: any[]): this {
    this.boundParams = params;
    return this;
  }

  async first(): Promise<any> {
    const response = this.findResponse();
    return Array.isArray(response) ? response[0] : response;
  }

  async all(): Promise<{ results: any[]; success: boolean; meta: any }> {
    const response = this.findResponse();
    return {
      results: Array.isArray(response) ? response : response ? [response] : [],
      success: true,
      meta: { duration: 1, changes: 1 }
    };
  }

  async run(): Promise<{ success: boolean; meta: any }> {
    return {
      success: true,
      meta: { changes: 1, last_row_id: 1, duration: 1 }
    };
  }

  // This is the key method that Drizzle ORM expects for D1
  raw(): { values: () => Promise<any[][]> } {
    return {
      values: async () => {
        const response = this.findResponse();
        if (Array.isArray(response)) {
          return response.map(item => Object.values(item));
        }
        return response ? [Object.values(response)] : [];
      }
    };
  }

  private findResponse(): any {
    // Find matching response based on query patterns
    for (const [pattern, response] of this.mockResponses.entries()) {
      if (this.query.toLowerCase().includes(pattern.toLowerCase())) {
        return response;
      }
    }
    
    // Default responses based on query type
    if (this.query.toLowerCase().includes('select')) {
      return [];
    } else if (this.query.toLowerCase().includes('insert')) {
      return { id: 'mock-id', created_at: new Date().toISOString() };
    } else if (this.query.toLowerCase().includes('update')) {
      return { updated_at: new Date().toISOString() };
    }
    
    return null;
  }
}

// Mock D1 database that works with Drizzle ORM
export class MockD1DatabaseForDrizzle {
  private mockResponses: Map<string, any> = new Map();
  private queryLog: string[] = [];

  constructor(responses: Record<string, any> = {}) {
    Object.entries(responses).forEach(([pattern, response]) => {
      this.mockResponses.set(pattern, response);
    });
  }

  prepare(query: string): MockD1PreparedStatement {
    this.queryLog.push(query);
    return new MockD1PreparedStatement(query, this.mockResponses);
  }

  async batch(statements: any[]): Promise<any[]> {
    return statements.map(() => ({
      success: true,
      meta: { changes: 1, last_row_id: 1, duration: 1 },
      results: []
    }));
  }

  async exec(query: string): Promise<{ count: number; duration: number }> {
    this.queryLog.push(query);
    return { count: 1, duration: 1 };
  }

  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }

  // Helper methods for testing
  getQueryLog(): string[] {
    return [...this.queryLog];
  }

  setMockResponse(pattern: string, response: any): void {
    this.mockResponses.set(pattern, response);
  }

  clearQueryLog(): void {
    this.queryLog = [];
  }
}

// Create a Drizzle database instance with mocked D1
export function createMockDrizzleDatabase(responses: Record<string, any> = {}) {
  const mockD1 = new MockD1DatabaseForDrizzle(responses);
  return drizzle(mockD1 as any);
}

// Helper to create common database responses for testing
export function createCommonDatabaseResponses() {
  return {
    // User profiles
    'user_profiles': [
      {
        id: 'profile-1',
        user_id: 'test-user-id',
        title: 'Software Engineer',
        industry: 'Technology',
        location: 'San Francisco, CA',
        experience: 5,
        learning_style: 'visual',
        time_commitment: 10,
        budget_range: '$1000-$5000',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ],
    
    // Skills
    'skills': [
      {
        id: 'skill-1',
        name: 'JavaScript',
        category: 'Programming Languages',
        description: 'JavaScript programming language',
        created_at: new Date().toISOString(),
      },
      {
        id: 'skill-2',
        name: 'React',
        category: 'Frontend Frameworks',
        description: 'React JavaScript library',
        created_at: new Date().toISOString(),
      }
    ],
    
    // User skills
    'user_skills': [
      {
        id: 'user-skill-1',
        user_id: 'test-user-id',
        skill_id: 'skill-1',
        level: 'intermediate',
        years_experience: 3,
        last_used: new Date().toISOString(),
        certifications: JSON.stringify(['JavaScript Fundamentals']),
        confidence_score: 0.8,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ],
    
    // Gap analyses
    'gap_analyses': [
      {
        id: 'analysis-1',
        user_id: 'test-user-id',
        target_job_title: 'Senior Frontend Developer',
        overall_match: 0.75,
        analysis_data: JSON.stringify({
          skill_gaps: [
            {
              skill_name: 'TypeScript',
              current_level: null,
              required_level: 'intermediate',
              gap_severity: 'moderate'
            }
          ]
        }),
        created_at: new Date().toISOString(),
      }
    ],
    
    // Job requirements
    'job_requirements': [
      {
        id: 'job-1',
        title: 'Senior Frontend Developer',
        company: 'Tech Corp',
        industry: 'Technology',
        location: 'San Francisco, CA',
        required_skills: JSON.stringify([
          {
            skill_name: 'React',
            importance: 'critical',
            minimum_level: 'advanced',
            years_required: 3
          },
          {
            skill_name: 'TypeScript',
            importance: 'important',
            minimum_level: 'intermediate',
            years_required: 2
          }
        ]),
        created_at: new Date().toISOString(),
      }
    ],
    
    // Trends data
    'skill_trends': [
      {
        id: 'trend-1',
        skill_name: 'React',
        industry: 'Technology',
        region: 'US',
        demand_score: 0.9,
        growth_rate: 0.15,
        forecast_period: '2024-Q1',
        created_at: new Date().toISOString(),
      }
    ],
  };
}
// Mock database for testing
import { vi } from 'vitest';
import { createMockDrizzleDatabase, createCommonDatabaseResponses } from '../drizzle-d1-mock';

export const createMockDatabase = () => {
  const mockQueryBuilder = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    then: vi.fn((callback) => callback([])),
  };

  const mockDatabase = {
    select: vi.fn(() => mockQueryBuilder),
    insert: vi.fn(() => mockQueryBuilder),
    update: vi.fn(() => mockQueryBuilder),
    delete: vi.fn(() => mockQueryBuilder),
    transaction: vi.fn(),
  };

  return { mockDatabase, mockQueryBuilder };
};

export const mockDrizzleDatabase = (mockResponses: any = {}) => {
  const { mockDatabase, mockQueryBuilder } = createMockDatabase();

  // Set up default responses
  if (mockResponses.select) {
    (mockQueryBuilder.limit as jest.Mock).mockResolvedValue(mockResponses.select);
    (mockQueryBuilder.execute as jest.Mock).mockResolvedValue(mockResponses.select);
    (mockQueryBuilder.then as jest.Mock).mockImplementation((callback) => callback(mockResponses.select));
  }
  
  if (mockResponses.insert) {
    (mockQueryBuilder.returning as jest.Mock).mockResolvedValue(mockResponses.insert);
    (mockQueryBuilder.execute as jest.Mock).mockResolvedValue(mockResponses.insert);
  }
  
  if (mockResponses.update) {
    (mockQueryBuilder.returning as jest.Mock).mockResolvedValue(mockResponses.update);
    (mockQueryBuilder.execute as jest.Mock).mockResolvedValue(mockResponses.update);
  }

  if (mockResponses.transaction) {
    mockDatabase.transaction.mockImplementation(mockResponses.transaction);
  }

  return mockDatabase;
};

// New helper function that creates a proper Drizzle database mock
export const createDrizzleDatabaseMock = (customResponses: Record<string, any> = {}) => {
  const commonResponses = createCommonDatabaseResponses();
  const responses = { ...commonResponses, ...customResponses };
  return createMockDrizzleDatabase(responses);
};
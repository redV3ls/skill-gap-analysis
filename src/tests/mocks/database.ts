// Mock database for testing
import { jest } from '@jest/globals';
import { createMockDrizzleDatabase, createCommonDatabaseResponses } from '../drizzle-d1-mock';

export const createMockDatabase = () => {
  const mockQueryBuilder = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue([]),
    then: jest.fn((callback) => callback([])),
  };

  const mockDatabase = {
    select: jest.fn(() => mockQueryBuilder),
    insert: jest.fn(() => mockQueryBuilder),
    update: jest.fn(() => mockQueryBuilder),
    delete: jest.fn(() => mockQueryBuilder),
    transaction: jest.fn(),
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
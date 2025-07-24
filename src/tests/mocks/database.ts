// Mock database for testing
import { jest } from '@jest/globals';

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
    mockQueryBuilder.limit.mockResolvedValue(mockResponses.select);
  }
  
  if (mockResponses.insert) {
    mockQueryBuilder.returning.mockResolvedValue(mockResponses.insert);
  }
  
  if (mockResponses.update) {
    mockQueryBuilder.returning.mockResolvedValue(mockResponses.update);
  }

  if (mockResponses.transaction) {
    mockDatabase.transaction.mockImplementation(mockResponses.transaction);
  }

  return mockDatabase;
};
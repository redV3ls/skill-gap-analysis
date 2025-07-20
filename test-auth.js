// Simple test script to verify authentication endpoints
// Run with: node test-auth.js

const API_BASE = 'http://127.0.0.1:8787/api/v1';

async function testEndpoint(method, endpoint, data = null, headers = {}) {
  const url = `${API_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    console.log(`\n${method} ${endpoint}`);
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(result, null, 2));
    
    return { status: response.status, data: result };
  } catch (error) {
    console.error(`Error testing ${method} ${endpoint}:`, error.message);
    return { status: 500, error: error.message };
  }
}

async function runTests() {
  console.log('🧪 Testing Skill Gap Analysis API Authentication');
  console.log('================================================');

  // Test 1: Health check
  await testEndpoint('GET', '/health');

  // Test 2: API root
  await testEndpoint('GET', '');

  // Test 3: Register new user
  const registerData = {
    email: 'test@example.com',
    password: 'TestPass123!',
    name: 'Test User',
    organization: 'Test Org'
  };
  
  const registerResult = await testEndpoint('POST', '/auth/register', registerData);
  let authToken = null;
  
  if (registerResult.status === 201) {
    authToken = registerResult.data.token;
    console.log('✅ Registration successful');
  } else if (registerResult.status === 409) {
    console.log('ℹ️  User already exists, trying login...');
    
    // Test 4: Login existing user
    const loginData = {
      email: 'test@example.com',
      password: 'TestPass123!'
    };
    
    const loginResult = await testEndpoint('POST', '/auth/login', loginData);
    if (loginResult.status === 200) {
      authToken = loginResult.data.token;
      console.log('✅ Login successful');
    }
  }

  if (authToken) {
    // Test 5: Get user profile
    await testEndpoint('GET', '/auth/me', null, {
      'Authorization': `Bearer ${authToken}`
    });

    // Test 6: Create API key
    const apiKeyData = {
      name: 'Test API Key',
      description: 'Testing API key creation',
      permissions: ['read', 'write']
    };
    
    const apiKeyResult = await testEndpoint('POST', '/auth/api-keys', apiKeyData, {
      'Authorization': `Bearer ${authToken}`
    });

    if (apiKeyResult.status === 201) {
      const apiKey = apiKeyResult.data.api_key.key;
      console.log('✅ API key created successfully');

      // Test 7: Use API key for authentication
      await testEndpoint('GET', '/auth/me', null, {
        'X-API-Key': apiKey
      });

      // Test 8: List API keys
      await testEndpoint('GET', '/auth/api-keys', null, {
        'Authorization': `Bearer ${authToken}`
      });
    }

    // Test 9: Refresh token
    await testEndpoint('POST', '/auth/refresh', null, {
      'Authorization': `Bearer ${authToken}`
    });
  }

  // Test 10: Rate limiting (make multiple requests quickly)
  console.log('\n🚦 Testing rate limiting...');
  for (let i = 0; i < 5; i++) {
    await testEndpoint('GET', '/health');
  }

  console.log('\n✅ Authentication tests completed!');
}

// Run the tests
runTests().catch(console.error);
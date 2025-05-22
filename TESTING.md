# Test Plan for Zaptec Homey App

This document describes how to test the Zaptec app for Homey at different levels.

## Automated Tests

The app uses Jest as a testing framework. Run the tests with:

```bash
npm test
```

You can also run specific tests:

```bash
# Run only API tests
npm test -- lib/zaptec/api.spec.ts

# Run only Pro driver tests
npm test -- drivers/pro/driver.spec.ts

# Run tests in watch mode
npm run test:watch
```

### Integration Test

There is also a manual integration test that can be run against a real Homey device with the app installed:

```bash
npm run test:integration
```

This script will ask for your Homey IP address and authentication token, and then test the communication with any Zaptec chargers you have added to your Homey.

### Test Coverage

We have the following types of tests:

1. **API Tests** (`lib/zaptec/api.spec.ts`) - Tests for Zaptec API integration
2. **Driver Tests** (`drivers/*/driver.spec.ts`) - Tests for driver functionality for each model

## How to Add Tests

### Adding API Tests

Add new tests in `lib/zaptec/api.spec.ts`. Use `nock` to mock API responses:

```typescript
it('should test something new', async () => {
  // Mock authentication
  nock('https://api.zaptec.com')
    .post('/oauth/token')
    .reply(200, { access_token: 'TEST_TOKEN', token_type: 'Bearer', expires_in: 9000 });
    
  // Mock API response
  nock('https://api.zaptec.com')
    .matchHeader('Authorization', 'Bearer TEST_TOKEN')
    .get('/api/some-endpoint')
    .reply(200, { data: 'test' });
    
  // Test functionality
  await api.authenticate('test', 'test');
  const result = await api.someFunction();
  
  // Verify
  assert.strictEqual(result.data, 'test');
});
```

### Adding Driver Tests

To test new flow functions, add test cases to the relevant `driver.spec.ts` file:

```typescript
it('should test a new flow action', async () => {
  // Setup test device with custom functionality
  const mockDevice = {
    ...mockProDevice,
    customFunction: async () => {
      // test-specific implementation
      return true;
    }
  };
  
  // Register flow listener
  mockFlowListeners['action_id'] = ({ device, parameter }) => device.customFunction(parameter);
  
  // Run listener with mocked data
  const listener = mockFlowListeners['action_id'];
  const result = await listener({ device: mockDevice, parameter: 'value' });
  
  // Verify result
  assert.strictEqual(result, true);
});
```

### Mocking Homey and Zaptec API

We use Jest to mock both the Homey module and Zaptec API:

```typescript
// Mock Homey module
jest.mock('homey', () => ({
  Driver: class {
    log(message: string) {}
    async onInit() {}
  },
  __: (key: string) => key,
  // Add more necessary properties here...
}), { virtual: true });

// Mock ZaptecApi
const mockZaptecApi = {
  authenticate: async () => true,
  getChargers: async () => ({ Data: [] }),
  // Add more methods as needed...
};

jest.mock('../../lib/zaptec', () => ({
  ZaptecApi: jest.fn().mockImplementation(() => mockZaptecApi),
  // Other exported values from the module...
}));
```

## Manual Testing

### Prerequisites

For manual testing, you need:

1. A Homey device (physical or development environment)
2. A Zaptec account with at least one charger configured
3. Node.js and npm installed

### Testing Setup

1. Clone the repository:
   ```
   git clone https://github.com/username/com.zaptec.git
   cd com.zaptec
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the app in development mode:
   ```
   npm run start
   ```

4. Follow the instructions in the Homey Developer app to add a test charger

### Test Checklist

#### Basic Tests
- [ ] Authentication with username/password
- [ ] Discover chargers
- [ ] Display correct charger status

#### Functionality Tests
- [ ] Start charging
- [ ] Stop charging
- [ ] Set maximum charging current
- [ ] Lock/unlock cable
- [ ] Reboot charger

#### Flow Tests
- [ ] Test all condition cards
- [ ] Test all action cards

## Continuous Integration

We use GitHub Actions for continuous integration. Tests are run automatically on push and pull requests.

The workflow configuration can be found in `.github/workflows/test.yml`. 
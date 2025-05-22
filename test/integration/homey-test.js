/**
 * Homey Integration Test
 * 
 * This test needs to be run manually against a Homey with the app installed
 * Run with: node test/integration/homey-test.js
 */

const HomeyAPI = require('homey-api').default;
const readline = require('readline');

// Create readline interface for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function testHomeyIntegration() {
  console.log('Homey Integration Test for Zaptec App');
  console.log('=====================================');
  
  // Ask for Homey information
  const homeyIp = await askQuestion('Enter Homey IP address (e.g. 192.168.0.123): ');
  const homeyId = await askQuestion('Enter Homey ID (optional): ');
  const homeyToken = await askQuestion('Enter Bearer token for Homey: ');
  
  try {
    console.log('Connecting to Homey...');
    
    // Connect to Homey
    const homeyApi = new HomeyAPI({
      host: homeyIp,
      token: homeyToken
    });
    
    // Get all devices
    console.log('Retrieving device details...');
    const devices = await homeyApi.devices.getDevices();
    
    // Filter out Zaptec devices
    const zaptecDevices = Object.values(devices).filter(device => 
      device.driverId && 
      ['pro', 'go', 'go2', 'home'].includes(device.driverId)
    );
    
    if (zaptecDevices.length === 0) {
      console.log('No Zaptec devices found. Have you added a charger in the app?');
      process.exit(1);
    }
    
    console.log(`Found ${zaptecDevices.length} Zaptec devices:`);
    
    // Show details for each device
    for (const device of zaptecDevices) {
      console.log(`\n[${device.name}] (${device.driverId})`);
      console.log('Capabilities:');
      
      // Show all capabilities with values
      for (const [capabilityId, value] of Object.entries(device.capabilitiesObj)) {
        console.log(`  - ${capabilityId}: ${value.value}`);
      }
      
      // Test an action if the device supports it
      if (device.capabilitiesObj['charging_button'] !== undefined) {
        const currentValue = device.capabilitiesObj['charging_button'].value;
        console.log(`\nTesting toggling of charging (current value: ${currentValue})`);
        
        if (await askYesNo('Do you want to test changing the charging status?')) {
          // Toggle charging_button
          try {
            await homeyApi.devices.setCapabilityValue({
              deviceId: device.id,
              capabilityId: 'charging_button',
              value: !currentValue
            });
            console.log(`Changed charging_button to ${!currentValue}`);
            
            // Wait a bit and read the value again
            console.log('Waiting 3 seconds...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Update device info
            const updatedDevice = await homeyApi.devices.getDevice({ id: device.id });
            console.log(`New value: ${updatedDevice.capabilitiesObj['charging_button'].value}`);
          } catch (error) {
            console.error('Error changing capability:', error.message);
          }
        }
      }
    }
    
    console.log('\nTest completed!');
    
  } catch (error) {
    console.error('Error in integration test:', error.message);
    process.exit(1);
  }
  
  rl.close();
}

// Helper function to ask questions
function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

// Helper function for yes/no questions
async function askYesNo(question) {
  const answer = await askQuestion(`${question} (y/n): `);
  return answer.toLowerCase().startsWith('y');
}

// Run the test
testHomeyIntegration().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
}); 
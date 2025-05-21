/**
 * Homey-integrasjonstest
 * 
 * Denne testen må kjøres manuelt mot en Homey hvor appen er installert
 * Kjør med: node test/integration/homey-test.js
 */

const HomeyAPI = require('homey-api').default;
const readline = require('readline');

// Opprett readline-grensesnitt for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function testHomeyIntegration() {
  console.log('Homey Integrasjonstest for Zaptec-appen');
  console.log('=======================================');
  
  // Spør om Homey-informasjon
  const homeyIp = await askQuestion('Skriv inn IP-adresse til Homey (f.eks. 192.168.0.123): ');
  const homeyId = await askQuestion('Skriv inn Homey ID (valgfritt): ');
  const homeyToken = await askQuestion('Skriv inn Bearer token for Homey: ');
  
  try {
    console.log('Kobler til Homey...');
    
    // Koble til Homey
    const homeyApi = new HomeyAPI({
      host: homeyIp,
      token: homeyToken
    });
    
    // Hent alle enheter
    console.log('Henter enhetsdetaljer...');
    const devices = await homeyApi.devices.getDevices();
    
    // Filtrer ut Zaptec-enheter
    const zaptecDevices = Object.values(devices).filter(device => 
      device.driverId && 
      ['pro', 'go', 'go2', 'home'].includes(device.driverId)
    );
    
    if (zaptecDevices.length === 0) {
      console.log('Ingen Zaptec-enheter funnet. Har du lagt til en lader i appen?');
      process.exit(1);
    }
    
    console.log(`Fant ${zaptecDevices.length} Zaptec-enheter:`);
    
    // Vis detaljer for hver enhet
    for (const device of zaptecDevices) {
      console.log(`\n[${device.name}] (${device.driverId})`);
      console.log('Capabilities:');
      
      // Vis alle capabilities med verdier
      for (const [capabilityId, value] of Object.entries(device.capabilitiesObj)) {
        console.log(`  - ${capabilityId}: ${value.value}`);
      }
      
      // Test en handling hvis enheten støtter det
      if (device.capabilitiesObj['charging_button'] !== undefined) {
        const currentValue = device.capabilitiesObj['charging_button'].value;
        console.log(`\nTester toggling av lading (nåværende verdi: ${currentValue})`);
        
        if (await askYesNo('Vil du teste å endre ladestatus?')) {
          // Toggle charging_button
          try {
            await homeyApi.devices.setCapabilityValue({
              deviceId: device.id,
              capabilityId: 'charging_button',
              value: !currentValue
            });
            console.log(`Endret charging_button til ${!currentValue}`);
            
            // Vent litt og les verdien igjen
            console.log('Venter 3 sekunder...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Oppdater enhetsinfo
            const updatedDevice = await homeyApi.devices.getDevice({ id: device.id });
            console.log(`Ny verdi: ${updatedDevice.capabilitiesObj['charging_button'].value}`);
          } catch (error) {
            console.error('Feil ved endring av capability:', error.message);
          }
        }
      }
    }
    
    console.log('\nTest fullført!');
    
  } catch (error) {
    console.error('Feil i integrasjonstest:', error.message);
    process.exit(1);
  }
  
  rl.close();
}

// Hjelpefunksjon for å stille spørsmål
function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

// Hjelpefunksjon for ja/nei-spørsmål
async function askYesNo(question) {
  const answer = await askQuestion(`${question} (j/n): `);
  return answer.toLowerCase().startsWith('j');
}

// Kjør testen
testHomeyIntegration().catch(error => {
  console.error('Uventet feil:', error);
  process.exit(1);
}); 
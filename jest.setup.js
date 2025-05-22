/**
 * Jest setup fil for Zaptec Homey-app tester
 * 
 * Denne filen håndterer globale mock-oppsett for Jest
 */

// Gjør en enkel mock av Homey-modulen slik at den er tilgjengelig globalt
jest.mock('homey', () => ({
  Driver: class {
    log(message) {}
    async onInit() {}
  },
  __: (key) => key,
  flow: {
    getActionCard: (id) => ({
      registerRunListener: (listener) => ({id})
    }),
    getConditionCard: (id) => ({
      registerRunListener: (listener) => ({id})
    })
  }
}), { virtual: true });

// Globale mock-funksjoner eller objekter kan legges til her

// Cleanup etter hver test
afterEach(() => {
  jest.clearAllMocks();
}); 
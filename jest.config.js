/** @type {import('jest').Config} */
module.exports = {
  // Endre testmiljøet til node
  testEnvironment: 'node',
  
  // Bruk ts-jest for å håndtere TypeScript
  preset: 'ts-jest',
  
  // Behandle .ts filer som ESM
  extensionsToTreatAsEsm: ['.ts'],
  
  // Transformasjon av filer
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest', 
      {
        tsconfig: 'tsconfig.json',
        useESM: true,
      }
    ]
  },
  
  // Mønster for testfiler
  testMatch: [
    '**/__tests__/**/*.ts?(x)',
    '**/?(*.)+(spec|test).ts?(x)'
  ],
  
  // Ignorer disse mappene
  modulePathIgnorePatterns: [
    '<rootDir>/.homeybuild',
    '<rootDir>/node_modules'
  ],
  
  // Oppsett før hver test
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Opprett coverage-rapport?
  collectCoverage: false,
  
  // Tillater import uten filendelser
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Informasjon om miljøet
  verbose: true
}; 
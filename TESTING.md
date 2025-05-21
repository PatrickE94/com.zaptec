# Testplan for Zaptec Homey-app

Dette dokumentet beskriver hvordan du kan teste Zaptec-appen for Homey på forskjellige nivåer.

## Automatiserte tester

Appen bruker Mocha som rammeverk for automatiserte tester. Testene kjøres ved å kjøre:

```bash
npm test
```

### Testdekning

Vi har følgende typer tester:

1. **API-tester** (`lib/zaptec/api.spec.ts`) - Tester for Zaptec API-integrasjon
2. **Driver-tester** (`drivers/*/driver.spec.ts`) - Tester for driverfunksjonalitet for hver modell

## Hvordan legge til tester

### Legge til API-tester

Legg til nye tester i `lib/zaptec/api.spec.ts`. Bruk `nock` for å mocke API-responser:

```typescript
it('should test something new', async () => {
  // Mock autentisering
  nock('https://api.zaptec.com')
    .post('/oauth/token')
    .reply(200, { access_token: 'TEST_TOKEN', token_type: 'Bearer', expires_in: 9000 });
    
  // Mock API-respons
  nock('https://api.zaptec.com')
    .matchHeader('Authorization', 'Bearer TEST_TOKEN')
    .get('/api/some-endpoint')
    .reply(200, { data: 'test' });
    
  // Test funksjonaliteten
  await api.authenticate('test', 'test');
  const result = await api.someFunction();
  
  // Verify
  assert.strictEqual(result.data, 'test');
});
```

### Legge til driver-tester

For å teste nye flow-funksjoner, legg til testcases i relevant `driver.spec.ts` fil:

```typescript
it('should test a new flow action', async () => {
  // Setup test device med custom funksjonalitet
  const mockDevice = {
    ...mockProDevice,
    customFunction: async () => {
      // test-spesifikk implementasjon
      return true;
    }
  };
  
  // Hent flow listener som ble registrert
  const listener = mockFlowListeners['action_id'];
  
  // Kjør listener med mockede data
  const result = await listener({ device: mockDevice, parameter: 'value' });
  
  // Verifiser resultat
  assert.strictEqual(result, true);
});
```

## Manuell testing

### Forutsetninger

For å teste manuelt trenger du:

1. En Homey-enhet (fysisk eller utviklingsmiljø)
2. En Zaptec-konto med minst én lader konfigurert
3. Node.js og npm installert

### Oppsett for testing

1. Klon repoet:
   ```
   git clone https://github.com/username/com.zaptec.git
   cd com.zaptec
   ```

2. Installer avhengigheter:
   ```
   npm install
   ```

3. Kjør appen i utviklingsmodus:
   ```
   npm run start
   ```

4. Følg instruksjonene i Homey Developer-appen for å legge til en testlader

### Test-sjekkliste

#### Grunnleggende tester
- [ ] Autentisering med brukernavn/passord
- [ ] Oppdage ladere
- [ ] Vise korrekt status på ladere

#### Funksjonalitetstester
- [ ] Start lading
- [ ] Stopp lading
- [ ] Sett maksimal ladestrøm
- [ ] Låse/låse opp kabel
- [ ] Omstarte lader

#### Flow-tester
- [ ] Test alle betingelseskort
- [ ] Test alle handlingskort

## Kontinuerlig integrasjon

Vi bruker GitHub Actions for kontinuerlig integrasjon. Testene kjøres automatisk ved push og pull requests.

Workflow-konfigurasjonen finnes i `.github/workflows/test.yml`. 
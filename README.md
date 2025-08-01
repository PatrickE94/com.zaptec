# Zaptec
[![Validate Homey App](https://github.com/PatrickE94/com.zaptec/actions/workflows/homey-app-validate.yml/badge.svg)](https://github.com/PatrickE94/com.zaptec/actions/workflows/homey-app-validate.yml)
[![Build Homey App](https://github.com/PatrickE94/com.zaptec/actions/workflows/homey-build-release.yml/badge.svg)](https://github.com/PatrickE94/com.zaptec/actions/workflows/homey-build-release.yml)

Adds support for Zaptec charging products.

## Documentation
Integration guide is found [here](https://zaptec.readme.io/)

## Github actions
Homey validate the code automatically when pushing to the main branch.

To use the github action for versioning, tagging, changelog and publishing, one need to aquire a personal access token (PAT) from [Developer portal](https://tools.developer.homey.app/me) and save it as a secret in your repository named `HOMEY_PAT`.

## Links
[Homey App](https://homey.app/a/com.zaptec)  
[Homey Community](https://community.homey.app/t/app-pro-zaptec-charging/118631)

Using [Material Web](https://github.com/material-components/material-web) for components.
Import modules in index.js
And bundle using rollup:
```
cd widgets/lights/public &&
npx rollup -p @rollup/plugin-node-resolve index.js -o bundle.js
```
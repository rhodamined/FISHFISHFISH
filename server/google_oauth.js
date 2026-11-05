// Updated 11/26/2025

const dotenv = require('dotenv');
dotenv.config();

/* --------------------------*/
/* OAUTH2 ACCESS TOKENS      */
/* --------------------------*/

// Had to adjust from service account key parsing with JSON in 2025; deprecated
// Follow process at:
// https://developers.google.com/identity/protocols/oauth2/service-account
// https://docs.cloud.google.com/iam/docs/create-short-lived-credentials-direct#rest_1
// Create Service account; invite service account to relevant docs
// Create and download a JSON key for service account
// Put key in file structure; hidden
// in .env, have a GOOGLE_APPLICATION_CREDENTIALS key, value is the path to the JSON file (getApplicationDefault will auto look for this)
// In Google Developer console, make sure Cloud API, Resource Manager API are enabled for project (+ actual project API)
// Service Accounts > Permissions > Manage Service Account Permissions > Add Another Role > Service Account Token Creator

const impersonatedServiceAccount = process.env.SERVICE_ACCOUNT;
const {GoogleAuth, Impersonated} = require('google-auth-library');
const scopes = ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/spreadsheets'];

async function getAccessTokenFromImpersonatedCredentials() {
  const googleAuth = new GoogleAuth({
    scopes: scopes,
  });
  // Construct the GoogleCredentials object which obtains the default configuration from your
  // working environment.
  const {credential} = await googleAuth.getApplicationDefault();

  // delegates: The chained list of delegates required to grant the final accessToken.
  // For more information, see:
  // https://cloud.google.com/iam/docs/create-short-lived-credentials-direct#sa-credentials-permissions
  // Delegate is NOT USED here.
  const delegates = [];

  // Create the impersonated credential
  const impersonatedCredentials = new Impersonated({
    sourceClient: credential,
    delegates,
    targetPrincipal: impersonatedServiceAccount,
    targetScopes: scopes,
    lifetime: 300,
  });

  // Get the OAuth2 token.
  // Once you've obtained the OAuth2 token, you can use it to make an authenticated call
  // to the target audience.
  const resp = await impersonatedCredentials.getAccessToken();
  // Token is in resp.token.

  // console.log('Generated OAuth2 token with length %s', resp.token.length);

  return resp;
};

module.exports = {
  getAccessTokenFromImpersonatedCredentials
}

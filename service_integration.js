#!/usr/bin/env node

const
    _ = require('lodash')
  , program = require('commander')
  , colors = require('colors')
  , nodeAsk = require('node-ask')
  , moment = require('moment')
  , docusign = require('docusign-esign')
  , ds_jwt_auth = require('./lib/ds_jwt_auth.js')
  , ds_configuration = require('./ds_configuration.js').config
  ;

function main(){
    // globals for the methods...
    let to_name
      , to_email
      ;
    const ds_api = new docusign.ApiClient() // Globals that won't change.
        , debug = true
        ;
    // initialization
    ds_jwt_auth.set_debug(debug);
    ds_jwt_auth.set_ds_config(ds_configuration, __dirname);
    ds_jwt_auth.set_ds_api(ds_api);

    // set_account will also get the user's info and create a token
    ds_jwt_auth.set_account(ds_configuration.target_account_id)
    .then (() => {
      console.log('Fin!')
    })
  }

function next() {

    // Ask user who the envelope should be sent to
    console.log(`This app will send an example document to be signed. Who will be the signer?`);
    let questions = [
      { key: 'name',  msg: 'The signer\'s name: ' , fn: 'prompt' },
      { key: 'email', msg: 'The signer\'s email: ', fn: 'prompt' },
    ];
    nodeAsk.ask(questions)
    .then((answers) => {
      to_name = answers.name;
      to_email = answers.email;
    })
    .then(() => {

      // create the JWT payload to get the user's token
      let payload = {
              "iss": CLIENT_ID,
              "sub": USER_GUID,
              "iat": new Date().getTime() / 1000,
              "exp": new Date().getTime() / 1000 + 3600,
              "aud": AUD,
              "scope": SCOPES,
          },
      jwt_token = jwt.sign(payload, private_key, {algorithm: 'RS256'});

      console.log(`Requesting the authentication token...`)
      return rp.post(`${AUTHENTICATION_URL}/oauth/token`, {
        json: true,
        form: {
            'grant_type': JWT_GRANT,
            'assertion': jwt_token
        },
        followAllRedirects: true
      })
    })
    // See the catch method below which handles the permission_needed case
    .then((result) => {
      // Save the token for later use
      docusign_credentials = {token: result.access_token,
        expires: new Date().getTime() + (result.expires_in * 1000)};
      let m = moment(docusign_credentials.expires);

      console.log(`Received the authentication token!`)
      console.log(`The token will expire ${m.fromNow()}. (${m.format()})`)
      // In production, you could cache docusign_credentials in a file
      // and use it repeatedly until it expires.
    })
    .then(() => {
      // Call userinfo to get the user's account_id and api_base_url
      // See https://docs.docusign.com/esign/guide/authentication/userinfo.html
      // If the user or account is fixed for this app then you can
      // treat the api_base_url as a constant. It is set per account and changes
      // extremely infrequently (less often than once a year)
      return rp.get(`${AUTHENTICATION_URL}/oauth/userinfo`, {
        json: true,
        auth: {bearer: docusign_credentials.token},
        followAllRedirects: true
      })
    })
    .then((result) => {
      let account_info = _.find(result.accounts, (account) => account.is_default),
          account_name = account_info.account_name;
      api_base_url = account_info.base_uri;
      account_id = account_info.account_id;
      console.log(`Using default account: ${account_name}. Account id: ${account_id}.`);

      // At this point, we have the authentication token, account_id, and
      // api_base_url. So we're now ready to make any calls to the API.
      // As an example, we'll create an envelope...

      // Read in the Envelopes::create payload and the HTML document.
      // Put together the Envelope create request and send it.
      let payload = JSON.parse(fs.readFileSync('payload.json')),
          html_doc = fs.readFileSync('simple_agreement.html');
      payload.recipients.signers[0].name  = to_name;
      payload.recipients.signers[0].email = to_email;
      payload.documents[0].documentBase64 =
        Buffer.from(html_doc).toString('base64'); // See https://stackoverflow.com/a/23097961/64904
      let url = `${api_base_url}/${API}/accounts/${account_id}/envelopes`;
      return rp.post(url, {
        body: payload,
        json: true,
        auth: {bearer: docusign_credentials.token},
        followAllRedirects: true
      })
    })
    .then((results) => {
      console.log (`Envelope was created! Envelope id: ${results.envelopeId}`);
      console.log ('Done.');
    })
    .catch((err) => {
        if (_.get(err, 'error.error') === 'consent_required') {
          let encoded_scopes = encodeURIComponent(SCOPES)
            , consent_url = `${AUTHENTICATION_URL}/oauth/auth?response_type=code&scope=${encoded_scopes}&client_id=${CLIENT_ID}&redirect_uri=${REGISTERED_REDIRECT_URI}`;

          console.log(`
Issue: you need to grant permission so this application can
impersonate ${USER_EMAIL}.
You can use Organization Administration to proactively grant
blanket permission to this application.

Or the user being impersonated can grant permission: open
the url (below) in a browser, login to DocuSign, and grant permission.
Then re-run this application.
${consent_url}
`.magenta)
        } else {
          console.log('Error! '.red);
          console.log(err.stack.red)
          console.log( JSON.stringify(err, null, 4).red);
        }
    })
}

main();

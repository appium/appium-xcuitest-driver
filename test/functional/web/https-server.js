const _ = require('lodash');
const https = require('https');
const { asyncify } = require('asyncbox');
const B = require('bluebird');
const pem = B.promisifyAll(require('pem'));

const HTTPS_PORT = 9762;
const LOCAL_HTTPS_URL = `https://localhost:${HTTPS_PORT}/`;

async function main () {
  // Create a random pem certificate
  let privateKey = await pem.createPrivateKeyAsync();
  let keys = await pem.createCertificateAsync({
    days: 1,
    selfSigned: true,
    serviceKey: privateKey.key,
    //altNames: ['localhost'],
  });
  pemCertificate = keys.certificate;

  // Host an SSL server that uses that certificate
  const serverOpts = {key: keys.serviceKey, cert: pemCertificate};
  sslServer = https.createServer(serverOpts, (req, res) => {
    res.end('Arbitrary text 353', +(new Date()));
  }).listen(HTTPS_PORT);

  console.log(`Started server with certificate: "${pemCertificate}"`);
  console.log(`Running on ${LOCAL_HTTPS_URL}`);
  return pemCertificate;
}

if (require.main === module) {
  asyncify(main);
}

module.exports = main;
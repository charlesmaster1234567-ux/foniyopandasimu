/**
 * SSL Certificate Generator for Development
 * Run this script to generate self-signed certificates for HTTPS testing
 * 
 * Usage: node generate-certs.js
 * 
 * Then set environment variables:
 *   set SSL_KEY_PATH=./certs/key.pem
 *   set SSL_CERT_PATH=./certs/cert.pem
 *   npm start
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const certsDir = path.join(__dirname, 'certs');

// Create certs directory if it doesn't exist
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir);
  console.log('📁 Created certs directory');
}

// Generate private key
const privateKey = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Generate self-signed certificate
const certificate = crypto.createSign({
  key: privateKey.privateKey,
  hash: 'sha256'
});

// Add certificate details
certificate.write({
  name: 'HeartSpace',
  commonName: 'localhost',
  organization: 'HeartSpace'
});

const cert = certificate.end({
  key: privateKey.privateKey,
  days: 365
});

// Alternative: simpler approach using crypto
const { key, cert: certificatePem } = generateSimpleCert();

// Write private key
fs.writeFileSync(path.join(certsDir, 'key.pem'), key);
console.log('✅ Generated private key: certs/key.pem');

// Write certificate
fs.writeFileSync(path.join(certsDir, 'cert.pem'), certificatePem);
console.log('✅ Generated certificate: certs/cert.pem');

console.log('');
console.log('🎉 Certificates generated successfully!');
console.log('');
console.log('To use HTTPS, add these to your .env file:');
console.log('  SSL_KEY_PATH=./certs/key.pem');
console.log('  SSL_CERT_PATH=./certs/cert.pem');
console.log('');
console.log('Or run with environment variables:');
console.log('  set SSL_KEY_PATH=./certs/key.pem');
console.log('  set SSL_CERT_PATH=./certs/cert.pem');
console.log('  npm start');
console.log('');

function generateSimpleCert() {
  // Generate a simple self-signed certificate
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048
  });

  const cert = crypto.createCertificate();
  cert.setSubject({
    CN: 'localhost',
    O: 'HeartSpace Development',
    L: 'Local',
    ST: 'Development',
    C: 'US'
  });
  cert.setIssuer({
    CN: 'HeartSpace Development',
    O: 'HeartSpace Development',
    L: 'Local',
    ST: 'Development',
    C: 'US'
  });
  cert.setValidity('365');
  cert.publicKey = publicKey;

  const certPem = cert.sign(privateKey, { expiresIn: '365d' });

  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    cert: certPem
  };
}


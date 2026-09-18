# Local TLS test fixtures

`localhost-cert.pem` and `localhost-key.pem` are a public, test-only self-signed
certificate/key pair for the loopback HTTPS proxy in the integration test. They
are not production credentials and must never be used outside tests. The
certificate covers `localhost` and `127.0.0.1` and is valid for 100 years from
generation to avoid routine expiry failures.

Regenerate from this directory with:

```sh
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout localhost-key.pem -out localhost-cert.pem -days 36500 \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
```

Running the tests does not require OpenSSL. The fixture certificate is trusted
only by the test clients; certificate verification remains enabled.

package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/asn1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"github.com/99designs/keyring"
	"github.com/privy-io/go-sdk/authorization"
)

const serviceName = "ACP CLI Signer"


type result struct {
	PublicKey *string `json:"publicKey,omitempty"`
	Signature *string `json:"signature,omitempty"`
	Error     *string `json:"error,omitempty"`
}

func outputJSON(v result) {
	_ = json.NewEncoder(os.Stdout).Encode(v)
}

func fatalf(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	outputJSON(result{Error: &msg})
	os.Exit(1)
}

func openKeyring() keyring.Keyring {
	kr, err := keyring.Open(keyring.Config{
		ServiceName:              serviceName,
		KeychainTrustApplication: true,
	})
	if err != nil {
		fatalf("keyring open failed: %v", err)
	}
	return kr
}

// encodePrivateKey stores the P256 private scalar as a fixed 32-byte big-endian slice.
func encodePrivateKey(priv *ecdsa.PrivateKey) []byte {
	b := make([]byte, 32)
	priv.D.FillBytes(b)
	return b
}

// decodePrivateKey reconstructs an *ecdsa.PrivateKey from 32 raw D bytes.
func decodePrivateKey(b []byte) (*ecdsa.PrivateKey, error) {
	curve := elliptic.P256()
	d := new(big.Int).SetBytes(b)
	priv := &ecdsa.PrivateKey{
		D:         d,
		PublicKey: ecdsa.PublicKey{Curve: curve},
	}
	priv.PublicKey.X, priv.PublicKey.Y = curve.ScalarBaseMult(b)
	return priv, nil
}

// publicKeyToSPKIBase64 serialises a P256 public key as SPKI DER then base64,
// matching the format returned by Privy's generateP256KeyPair.
func publicKeyToSPKIBase64(pub *ecdsa.PublicKey) (string, error) {
	der, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(der), nil
}

func cmdGenerate() {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		fatalf("key generation failed: %v", err)
	}

	pubB64, err := publicKeyToSPKIBase64(&priv.PublicKey)
	if err != nil {
		fatalf("public key encoding failed: %v", err)
	}

	kr := openKeyring()
	if err := kr.Set(keyring.Item{
		Key:   pubB64,
		Data:  encodePrivateKey(priv),
		Label: serviceName,
	}); err != nil {
		fatalf("keyring store failed: %v", err)
	}

	outputJSON(result{PublicKey: &pubB64})
}

func cmdSign(pubKeyB64, payload string) {
	if pubKeyB64 == "" {
		fatalf("--public-key is required")
	}
	if payload == "" {
		fatalf("--payload is required")
	}

	kr := openKeyring()
	item, err := kr.Get(pubKeyB64)
	if err != nil {
		fatalf("keyring get failed: %v", err)
	}

	priv, err := decodePrivateKey(item.Data)
	if err != nil {
		fatalf("key decode failed: %v", err)
	}

	// SHA-256 hash the payload, then sign.
	hash := sha256.Sum256([]byte(payload))
	r, s, err := ecdsa.Sign(rand.Reader, priv, hash[:])
	if err != nil {
		fatalf("signing failed: %v", err)
	}

	// Encode signature as DER (ASN.1 SEQUENCE { INTEGER r, INTEGER s }),
	// matching Privy's generateAuthorizationSignature output format.
	der, err := asn1.Marshal(struct {
		R, S *big.Int
	}{r, s})
	if err != nil {
		fatalf("signature encoding failed: %v", err)
	}

	sigB64 := base64.StdEncoding.EncodeToString(der)
	outputJSON(result{Signature: &sigB64})
}

// cmdSignPrivyAuth formats and signs a Privy authorization payload using the
// official Privy Go SDK (github.com/privy-io/go-sdk/authorization).
// The private key is looked up in the OS keychain via its base64 public key.
func cmdSignPrivyAuth(method, url, bodyJSON, appID, pubKeyB64 string) {
	if url == "" {
		fatalf("--url is required")
	}
	if bodyJSON == "" {
		fatalf("--body is required")
	}
	if appID == "" {
		fatalf("--app-id is required")
	}
	if pubKeyB64 == "" {
		fatalf("--public-key is required")
	}
	if method == "" {
		method = "POST"
	}

	kr := openKeyring()
	item, err := kr.Get(pubKeyB64)
	if err != nil {
		fatalf("keyring get failed: %v", err)
	}

	priv, err := decodePrivateKey(item.Data)
	if err != nil {
		fatalf("key decode failed: %v", err)
	}

	// Export as base64-encoded PKCS8 DER for the Privy SDK.
	pkcs8Bytes, err := x509.MarshalPKCS8PrivateKey(priv)
	if err != nil {
		fatalf("marshal private key: %v", err)
	}
	privateKey := base64.StdEncoding.EncodeToString(pkcs8Bytes)

	var body interface{}
	if err := json.Unmarshal([]byte(bodyJSON), &body); err != nil {
		fatalf("parse --body JSON: %v", err)
	}

	// Format the canonical payload bytes using the Privy Go SDK.
	payloadBytes, err := authorization.FormatRequestForAuthorizationSignature(
		authorization.WalletApiRequestSignatureInput{
			Version: 1,
			Method:  method,
			URL:     url,
			Body:    body,
			Headers: map[string]string{"privy-app-id": appID},
		},
	)
	if err != nil {
		fatalf("format payload: %v", err)
	}

	// Sign using the Privy Go SDK — handles wallet-auth: prefix internally.
	sig, err := authorization.GenerateAuthorizationSignature(privateKey, payloadBytes)
	if err != nil {
		fatalf("sign payload: %v", err)
	}

	outputJSON(result{Signature: &sig})
}

func usage() {
	fmt.Fprintf(os.Stderr, `Usage:
  acp-cli-signer generate
      Generate a P256 key pair. Private key is stored in the OS keyring.
      Outputs: {"publicKey":"<base64 SPKI>"}

  acp-cli-signer sign --public-key <base64 SPKI> --payload <string>
      Sign a payload using the private key stored for the given public key.
      Outputs: {"signature":"<base64 DER>"}

  acp-cli-signer sign-privy-auth --method <METHOD> --url <url> --body <json> --app-id <id> --public-key <base64 SPKI>
      Build, canonicalize (RFC 8785), and sign a Privy authorization payload.
      Looks up the private key in the OS keychain via its base64 public key.
      Outputs: {"signature":"<base64 DER>"}
`)
	os.Exit(1)
}

func main() {
	if len(os.Args) < 2 {
		usage()
	}

	switch os.Args[1] {
	case "generate":
		cmdGenerate()

	case "sign":
		var pubKey, payload string
		args := os.Args[2:]
		for i := 0; i < len(args); i++ {
			switch args[i] {
			case "--public-key":
				if i+1 < len(args) {
					pubKey = args[i+1]
					i++
				}
			case "--payload":
				if i+1 < len(args) {
					payload = args[i+1]
					i++
				}
			}
		}
		cmdSign(pubKey, payload)

	case "sign-privy-auth":
		var method, url, body, appID, pubKey string
		args := os.Args[2:]
		for i := 0; i < len(args); i++ {
			if i+1 >= len(args) {
				break
			}
			switch args[i] {
			case "--method":
				method = args[i+1]
				i++
			case "--url":
				url = args[i+1]
				i++
			case "--body":
				body = args[i+1]
				i++
			case "--app-id":
				appID = args[i+1]
				i++
			case "--public-key":
				pubKey = args[i+1]
				i++
			}
		}
		cmdSignPrivyAuth(method, url, body, appID, pubKey)

	default:
		usage()
	}
}

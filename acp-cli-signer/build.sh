#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../bin"

cd "$SCRIPT_DIR"

echo "→ Resolving dependencies..."
go mod tidy

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# go-keyring uses CGO on all platforms, so cross-compilation requires
# the target platform's SDK. We build native first, then attempt the
# other arch for a universal binary on macOS.
echo "→ Building native $ARCH..."
CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o "$OUT_DIR/acp-cli-signer-$ARCH" .

if [ "$OS" = "darwin" ]; then
  if [ "$ARCH" = "arm64" ]; then
    OTHER_ARCH="amd64"
    OTHER_FLAGS="-arch x86_64"
  else
    OTHER_ARCH="arm64"
    OTHER_FLAGS="-arch arm64"
  fi

  echo "→ Building $OTHER_ARCH..."
  CGO_ENABLED=1 GOARCH=$OTHER_ARCH \
    CGO_CFLAGS="$OTHER_FLAGS" CGO_LDFLAGS="$OTHER_FLAGS" \
    go build -trimpath -ldflags="-s -w" -o "$OUT_DIR/acp-cli-signer-$OTHER_ARCH" . || {
      echo "  ($OTHER_ARCH cross-build skipped — no cross-SDK available)"
      mv "$OUT_DIR/acp-cli-signer-$ARCH" "$OUT_DIR/acp-cli-signer"
      chmod +x "$OUT_DIR/acp-cli-signer"
      echo "✓ Built $ARCH binary: $OUT_DIR/acp-cli-signer"
      exit 0
    }

  echo "→ Creating universal binary..."
  lipo -create -output "$OUT_DIR/acp-cli-signer" \
    "$OUT_DIR/acp-cli-signer-arm64" \
    "$OUT_DIR/acp-cli-signer-amd64"
  rm "$OUT_DIR/acp-cli-signer-arm64" "$OUT_DIR/acp-cli-signer-amd64"
  echo "✓ Built universal binary: $OUT_DIR/acp-cli-signer"
else
  mv "$OUT_DIR/acp-cli-signer-$ARCH" "$OUT_DIR/acp-cli-signer"
  echo "✓ Built $OS/$ARCH binary: $OUT_DIR/acp-cli-signer"
fi

chmod +x "$OUT_DIR/acp-cli-signer"

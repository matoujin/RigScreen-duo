#!/bin/bash
# Build an unsigned-then-ad-hoc-signed iOS IPA on Linux.
# SideStore or Sideloadly must re-sign it with your Apple ID before install.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SDK="${SDK:-$ROOT/.sdk/iPhoneOS16.5.sdk}"
STAGE="$ROOT/build/stage"
APP="$STAGE/Payload/RigScreen.app"
WWW="$APP/www"

if [ ! -d "$SDK/System/Library/Frameworks/UIKit.framework" ]; then
  mkdir -p "$ROOT/.sdk"
  archive="$ROOT/.sdk/iPhoneOS16.5.sdk.tar.xz"
  if [ ! -f "$archive" ]; then
    curl -L --retry 3 -o "$archive" \
      "https://github.com/theos/sdks/releases/download/master-146e41f/iPhoneOS16.5.sdk.tar.xz"
  fi
  tar -C "$ROOT/.sdk" -xf "$archive"
fi

rm -rf "$STAGE"
mkdir -p "$WWW" "$ROOT/dist"
cp -R "$ROOT/ios/www/." "$WWW/"
cp "$ROOT/ios/AppIcon60x60@2x.png" "$ROOT/ios/AppIcon60x60@3x.png" "$APP/"

cp "$ROOT/ios/Info.plist" "$APP/Info.plist"
printf 'APPL????' > "$APP/PkgInfo"

CC="${CC:-clang}"
TARGET=(-target arm64-apple-ios15.0 -isysroot "$SDK" -miphoneos-version-min=15.0)
LDFLAGS=(
  -fuse-ld=/usr/bin/ld64.lld-18
  -Wl,-platform_version,ios,15.0.0,16.5.0
  -Wl,-arch,arm64
  -framework Foundation
  -framework CoreGraphics
  -framework UIKit
  -framework WebKit
)
"$CC" "${TARGET[@]}" -O2 -c "$ROOT/ios/httpd.c" -o "$ROOT/build/httpd.o"
"$CC" "${TARGET[@]}" -O2 -fobjc-arc -c "$ROOT/ios/main.m" -o "$ROOT/build/main.o"
"$CC" "${TARGET[@]}" -fobjc-arc "$ROOT/build/httpd.o" "$ROOT/build/main.o" "${LDFLAGS[@]}" -o "$APP/RigScreen"
ldid -S "$APP/RigScreen"

# Host-side check that the bundled page and wasm are served with the right type.
cc -DHTTPD_MAIN -O2 -o "$ROOT/build/httpd-host" "$ROOT/ios/httpd.c" -pthread
"$ROOT/build/httpd-host" "$WWW" > "$ROOT/build/httpd.port" &
HOST_PID=$!
trap 'kill "$HOST_PID" 2>/dev/null || true' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do
  PORT="$(cat "$ROOT/build/httpd.port" 2>/dev/null || true)"
  if [ -n "$PORT" ]; then break; fi
  sleep 0.1
done
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"
curl -fsS -D "$ROOT/build/wasm.headers" -o /dev/null \
  "http://127.0.0.1:${PORT}/lib/vendor/face_mesh/face_mesh_solution_simd_wasm_bin.wasm"
grep -i '^content-type: application/wasm' "$ROOT/build/wasm.headers"
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/shell.js"
CODE="$(curl --path-as-is -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/../Info.plist")"
test "$CODE" = "400"
kill "$HOST_PID" 2>/dev/null || true
trap - EXIT

(
  cd "$STAGE"
  rm -f "$ROOT/dist/RigScreen.ipa"
  zip -qr -X "$ROOT/dist/RigScreen.ipa" Payload
)
python3 - << PY
import pathlib, zipfile
ipa = pathlib.Path("$ROOT/dist/RigScreen.ipa")
with zipfile.ZipFile(ipa) as z:
    names = z.namelist()
assert any(n.startswith("Payload/RigScreen.app/RigScreen") for n in names), names[:8]
assert "Payload/RigScreen.app/www/index.html" in names
assert "Payload/RigScreen.app/www/lib/app.js" in names
assert not any(n.endswith("sample.psd") or n.endswith("sample2.psd") for n in names)
print(f"ipa {ipa} {ipa.stat().st_size} bytes, {len(names)} files")
PY
file "$APP/RigScreen"

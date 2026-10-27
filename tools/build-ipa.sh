#!/bin/bash
# Build an unsigned-then-ad-hoc-signed iOS IPA on Linux.
# SideStore or Sideloadly must re-sign it with your Apple ID before install.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
RIG_COMMIT="7ddbd9943ea3152561b3dc8348fd752c850f3e95"
SDK="${SDK:-$ROOT/.sdk/iPhoneOS16.5.sdk}"
SRC="${SRC:-/tmp/Anime2.5DRig}"
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

if [ ! -d "$SRC/.git" ]; then
  mkdir -p "$SRC"
  git -C "$SRC" init
  git -C "$SRC" remote add origin https://github.com/852wa/Anime2.5DRig.git
fi
if ! git -C "$SRC" rev-parse HEAD 2>/dev/null | grep -q "$RIG_COMMIT"; then
  git -C "$SRC" fetch --depth 1 origin "$RIG_COMMIT"
  git -C "$SRC" checkout --detach FETCH_HEAD
fi

rm -rf "$STAGE"
mkdir -p "$WWW/lib" "$WWW/licenses" "$ROOT/dist"

cp "$SRC/index.html" "$WWW/index.html"
cp -R "$SRC/lib/." "$WWW/lib/"
cp "$SRC/eye_close.psd" "$SRC/mouth_close.psd" "$WWW/"
cp "$SRC/LICENSE" "$WWW/licenses/Anime2.5DRig-MIT.txt"
cp "$SRC/lib/vendor/face_mesh/NOTICE.md" "$WWW/licenses/MediaPipe-NOTICE.md"
rm -rf "$WWW/lib/__pycache__"
cp "$ROOT/overlay/shell.css" "$ROOT/overlay/shell.js" "$WWW/"

python3 - "$WWW/index.html" << 'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
old_view = '<meta name="viewport" content="width=device-width, initial-scale=1">'
new_view = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
if old_view not in text:
    raise SystemExit("viewport tag missing")
text = text.replace(old_view, new_view, 1)
css = '<link rel="stylesheet" href="shell.css">'
if css not in text:
    text = text.replace("</head>", css + "\n</head>", 1)
js = '<script src="shell.js"></script>'
if js not in text:
    text = text.replace("</body>", js + "\n</body>", 1)
path.write_text(text)
PY

python3 - "$APP" << 'PY'
import pathlib, struct, sys, zlib
out_dir = pathlib.Path(sys.argv[1])

def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

def png(size, filename):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            nx = (x + 0.5) / size * 2 - 1
            ny = (y + 0.5) / size * 2 - 1
            d = (nx * nx + ny * ny) ** 0.5
            if d < 0.34:
                row += bytes((196, 44, 80, 255))
            elif d < 0.46:
                row += bytes((80, 28, 40, 255))
            else:
                row += bytes((20, 21, 28, 255))
        rows.append(bytes(row))
    raw = b"".join(rows)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    blob = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    (out_dir / filename).write_bytes(blob)

png(120, "AppIcon60x60@2x.png")
png(180, "AppIcon60x60@3x.png")
PY

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

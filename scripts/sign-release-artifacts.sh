#!/usr/bin/env bash

set -euo pipefail

SOURCE_DIR="${ARTIFACT_SOURCE_DIR:-dist}"
OUTPUT_DIR="${ARTIFACT_OUTPUT_DIR:-release-assets}"

mkdir -p "$OUTPUT_DIR"

echo "Collecting release artifacts from: $SOURCE_DIR"
echo "Output directory: $OUTPUT_DIR"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: source directory does not exist: $SOURCE_DIR" >&2
  exit 1
fi

# Add or remove extensions according to Chaterm's actual release outputs.
find "$SOURCE_DIR" -type f \( \
  -name "*.dmg" -o \
  -name "*.zip" -o \
  -name "*.exe" -o \
  -name "*.msi" -o \
  -name "*.AppImage" -o \
  -name "*.deb" -o \
  -name "*.rpm" -o \
  -name "latest*.yml" \
\) -exec cp {} "$OUTPUT_DIR"/ \;

artifact_count="$(find "$OUTPUT_DIR" -maxdepth 1 -type f ! -name "*.sig" ! -name "*.pem" ! -name "*.bundle" ! -name "SHA256SUMS.txt" | wc -l | tr -d ' ')"

if [ "$artifact_count" = "0" ]; then
  echo "Error: no release artifacts found in $SOURCE_DIR" >&2
  exit 1
fi

echo "Artifacts to sign:"
ls -lh "$OUTPUT_DIR"

for file in "$OUTPUT_DIR"/*; do
  [ -f "$file" ] || continue

  case "$file" in
    *.sig|*.pem|*.bundle|*SHA256SUMS.txt)
      continue
      ;;
  esac

  echo "Signing: $file"

  cosign sign-blob "$file" \
    --bundle "$file.bundle" \
    --output-signature "$file.sig" \
    --output-certificate "$file.pem"
done

echo "Generating SHA256SUMS.txt"
(
  cd "$OUTPUT_DIR"
  shasum -a 256 * > SHA256SUMS.txt
)

echo "Generating SLSA subject hashes"

# The SLSA generic generator expects base64-encoded lines in the format:
# <sha256>  <artifact-name>
#
# Exclude generated signature/certificate/bundle/checksum files from provenance subjects.
subjects_file="$(mktemp)"

(
  cd "$OUTPUT_DIR"
  for artifact in *; do
    [ -f "$artifact" ] || continue

    case "$artifact" in
      *.sig|*.pem|*.bundle|SHA256SUMS.txt)
        continue
        ;;
    esac

    shasum -a 256 "$artifact"
  done
) > "$subjects_file"

if [ ! -s "$subjects_file" ]; then
  echo "Error: failed to generate SLSA subject hashes" >&2
  exit 1
fi

base64_subjects="$(base64 < "$subjects_file" | tr -d '\n')"

# Expose hashes to GitHub Actions step output.
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "hashes=$base64_subjects" >> "$GITHUB_OUTPUT"
fi

echo "Done. Release assets:"
ls -lh "$OUTPUT_DIR"

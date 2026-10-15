#!/usr/bin/env bash

# Aiken v1.0.29 needs the OpenSSL 1.1 ABI; its old regional package URL is gone.
install_legacy_libssl() (
    set -euo pipefail
    url=$1
    sha256=$2
    work_dir=$(mktemp -d "${RUNNER_TEMP}/legacy-libssl.XXXXXX")
    trap 'rm -rf "$work_dir"' EXIT
    archive="$work_dir/libssl1.1.deb"

    # No retries: preserve provider wait/error headers and stop on a failed fetch.
    if ! curl --fail-with-body --show-error --location --proto '=https' --proto-redir '=https' \
        --tlsv1.2 --dump-header "$work_dir/headers" --output "$archive" "$url"; then
        cat "$work_dir/headers" >&2
        if [[ -f "$archive" ]]; then
            cat "$archive" >&2
        fi
        exit 1
    fi
    printf '%s  %s\n' "$sha256" "$archive" | sha256sum --check
    sudo dpkg --install "$archive"
)

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    # Canonical build30209631 publishes the checksum in this .changes file:
    # https://launchpadlibrarian.net/774729471/openssl_1.1.1f-1ubuntu2.24_amd64.changes
    install_legacy_libssl \
        'https://launchpadlibrarian.net/774729480/libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb' \
        '7cf39d70a639017d1dd7c8d36daa2258063608688e449fddf40ffdd46f992a78'
fi

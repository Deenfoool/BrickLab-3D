#!/usr/bin/env python3
"""Allow GLTFLoader's local blob fetches in the existing VPS CSP header.

Back up the nginx config before running this script, then run nginx -t and reload.
"""
import pathlib
import sys


def allow_blob_connections(text):
    lines = text.splitlines(keepends=True)
    found = False
    for index, line in enumerate(lines):
        if 'add_header Content-Security-Policy' not in line:
            continue
        if "connect-src 'self' blob:" in line:
            found = True
        elif "connect-src 'self' " in line:
            lines[index] = line.replace("connect-src 'self' ", "connect-src 'self' blob: ", 1)
            found = True
    if not found:
        raise ValueError('Expected an existing CSP connect-src directive; config left unchanged')
    return ''.join(lines)


if __name__ == '__main__':
    config = pathlib.Path(sys.argv[1])
    config.write_text(allow_blob_connections(config.read_text()))

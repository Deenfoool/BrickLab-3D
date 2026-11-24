#!/bin/sh
set -eu
dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sh "$dir/migrate.sh"
sh "$dir/provision-app.sh"

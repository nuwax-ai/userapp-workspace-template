#!/bin/sh
set -eu
# Use the same interpreter for pip and artifact construction.
exec python3 "$(dirname "$0")/build-standalone.py"

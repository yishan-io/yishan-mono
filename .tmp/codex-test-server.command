#!/bin/zsh
cd /private/tmp || exit 1
python3 -m http.server 9999

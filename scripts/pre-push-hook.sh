#!/usr/bin/env sh
# Wrapper that invokes the Node pre-push script from the repository `scripts` folder.
# Git executes this file during `git push` when installed at `.git/hooks/pre-push`.
node "$(dirname "$0")/../../scripts/pre-push.js"
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  exit $EXIT_CODE
fi
exit 0

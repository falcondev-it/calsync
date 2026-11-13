#!/bin/sh

apk --no-cache add curl
curl -fsSL "https://github.com/pnpm/pnpm/releases/download/v8.15.9/pnpm-linuxstatic-x64" -o /bin/pnpm; chmod +x /bin/pnpm;
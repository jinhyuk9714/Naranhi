SHELL := /bin/bash

.PHONY: proxy proxy-health extension-build

proxy:
	cd apps/proxy && pnpm dev

proxy-health:
	curl -i http://localhost:8787/health

extension-build:
	pnpm --filter @naranhi/extension build

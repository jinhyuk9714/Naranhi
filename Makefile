SHELL := /bin/bash

.PHONY: proxy

proxy:
	cd apps/proxy && node server.mjs

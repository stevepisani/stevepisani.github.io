# The same steps CI runs (.github/workflows/site.yml); see CLAUDE.md.
.PHONY: help install serve build check test clean

help:
	@echo "make install   Ruby gems (vendor/bundle) and Node packages"
	@echo "make serve     http://localhost:4000, scripts rebuilt on save"
	@echo "make build     bundle the scripts, then build the site into _site/"
	@echo "make check     build, then check every internal link and asset"
	@echo "make test      check, then the browser smoke test (about 5 minutes)"
	@echo "make clean     remove _site/ and the built scripts"

install:
	bundle config set --local path vendor/bundle
	bundle install
	npm install --no-audit --no-fund

serve:
	@trap 'kill 0' EXIT; npm run watch & bundle exec jekyll serve --host 0.0.0.0

build:
	npm run build
	LANG=C.UTF-8 bundle exec jekyll build --strict_front_matter

check: build
	npm run check

test: check
	npm test

clean:
	rm -rf _site/ .jekyll-cache/ assets/js/dist/

# Jekyll Site Makefile
# Common commands for managing your Jekyll site

.PHONY: help install serve build clean production deploy check

# Default target
help:
	@echo "🚀 Jekyll Site Management Commands:"
	@echo ""
	@echo "📦 Setup:"
	@echo "  install     Install Ruby dependencies"
	@echo "  update      Update Ruby dependencies"
	@echo ""
	@echo "🛠️  Development:"
	@echo "  serve       Start development server (localhost:4000)"
	@echo "  build       Build site to _site directory"
	@echo "  clean       Remove build artifacts"
	@echo ""
	@echo "🚀 Production:"
	@echo "  production  Build site for production"
	@echo "  deploy      Build and prepare for deployment"
	@echo ""
	@echo "🔍 Utilities:"
	@echo "  check       Check site configuration and dependencies"
	@echo "  doctor      Run Jekyll doctor to diagnose issues"
	@echo "  help        Show this help message"

# Install dependencies
install:
	@echo "📦 Installing Ruby dependencies..."
	@bundle install
	@echo "✅ Dependencies installed successfully!"

# Update dependencies
update:
	@echo "🔄 Updating Ruby dependencies..."
	@bundle update
	@echo "✅ Dependencies updated successfully!"

# Start development server
serve:
	@echo "🌐 Starting Jekyll development server..."
	@echo "📍 Site will be available at: http://localhost:4000"
	@echo "🔄 Auto-regeneration enabled"
	@echo "⏹️  Press Ctrl+C to stop"
	@bundle exec jekyll serve --host 0.0.0.0

# Build site
build:
	@echo "🏗️  Building Jekyll site..."
	@bundle exec jekyll build
	@echo "✅ Site built successfully in _site/ directory"

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf _site/
	@rm -rf .jekyll-cache/
	@rm -rf .sass-cache/
	@echo "✅ Build artifacts cleaned!"

# Build for production
production:
	@echo "🚀 Building site for production..."
	@JEKYLL_ENV=production bundle exec jekyll build
	@echo "✅ Production build complete in _site/ directory"

# Deploy preparation
deploy: clean production
	@echo "🚀 Site ready for deployment!"
	@echo "📁 Production files are in _site/ directory"
	@echo "🌐 You can now upload _site/ contents to your web server"

# Check site configuration
check:
	@echo "🔍 Checking site configuration..."
	@echo "📋 Ruby version:"
	@ruby --version
	@echo "📋 Bundler version:"
	@bundle --version
	@echo "📋 Jekyll version:"
	@bundle exec jekyll --version
	@echo "📋 Site configuration:"
	@bundle exec jekyll doctor
	@echo "✅ Configuration check complete!"

# Run Jekyll doctor
doctor:
	@echo "🏥 Running Jekyll doctor..."
	@bundle exec jekyll doctor

# Quick development workflow
dev: install serve

# Quick build workflow
quick: clean build

# Show server status
status:
	@echo "🔍 Checking Jekyll server status..."
	@if pgrep -f "jekyll serve" > /dev/null; then \
		echo "✅ Jekyll server is running"; \
		echo "🌐 Access at: http://localhost:4000"; \
		ps aux | grep "jekyll serve" | grep -v grep; \
	else \
		echo "❌ Jekyll server is not running"; \
		echo "💡 Run 'make serve' to start it"; \
	fi

# Stop server
stop:
	@echo "⏹️  Stopping Jekyll server..."
	@pkill -f "jekyll serve" || echo "No Jekyll server found"
	@echo "✅ Server stopped"

# Restart server
restart: stop serve

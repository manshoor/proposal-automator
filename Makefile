ifneq (,$(wildcard ./.env))
    include .env
    export
    ENV_FILE_PARAM = --env-file .env
endif

### Development ############################################

build:
	docker compose up --build --remove-orphans

up:
	docker compose up

up-d:
	docker compose up -d

up-d-build:
	docker compose up -d --build --remove-orphans

up-d-build-backend:
	docker compose up -d --no-deps --build --remove-orphans backend

up-d-build-dashboard:
	docker compose up -d --no-deps --build --remove-orphans dashboard

up-d-build-backend-force:
	docker compose up -d --force-recreate --no-deps --build --remove-orphans backend

up-d-build-dashboard-force:
	docker compose up -d --force-recreate --no-deps --build --remove-orphans dashboard

### Production #############################################

build-prod:
	docker compose -f docker-compose.prod.yml up --build --remove-orphans

up-d-prod:
	docker compose -f docker-compose.prod.yml up -d

up-d-prod-build:
	docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

up-d-prod-build-backend:
	docker compose -f docker-compose.prod.yml up -d --no-deps --build --remove-orphans backend

up-d-prod-build-dashboard:
	docker compose -f docker-compose.prod.yml up -d --no-deps --build --remove-orphans dashboard

up-d-prod-build-backend-force:
	docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps --build --remove-orphans backend

up-d-prod-build-dashboard-force:
	docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps --build --remove-orphans dashboard

prod-push-backend:
	docker compose -f docker-compose.prod.yml push backend

prod-push-dashboard:
	docker compose -f docker-compose.prod.yml push dashboard

prod-pull-backend:
	docker compose -f docker-compose.prod.yml pull backend

prod-pull-dashboard:
	docker compose -f docker-compose.prod.yml pull dashboard

### Stop & Clean ###########################################

down:
	docker compose down

down-v:
	docker compose down -v

down-prod:
	docker compose -f docker-compose.prod.yml down

down-prod-v:
	docker compose -f docker-compose.prod.yml down -v

restart:
	docker compose restart

restart-backend:
	docker compose restart backend

restart-dashboard:
	docker compose restart dashboard

### Monitoring #############################################

dps:
	docker ps -a

dcps:
	docker compose ps -a

images:
	docker images -a

monitor-all:
	docker compose logs -f -t

monitor-backend:
	docker compose logs -f -t backend

monitor-dashboard:
	docker compose logs -f -t dashboard

monitor-db:
	docker compose logs -f -t db

logs-backend:
	docker compose logs backend --tail 50

logs-dashboard:
	docker compose logs dashboard --tail 50

logs-db:
	docker compose logs db --tail 50

### Database ###############################################

db-shell:
	docker compose exec db psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-upwork_proposals}

db-dump:
	@mkdir -p backups
	docker compose exec db pg_dump -U $${POSTGRES_USER:-postgres} $${POSTGRES_DB:-upwork_proposals} > backups/dump_$$(date +%Y%m%d_%H%M%S).sql
	@echo "Database dumped to backups/"

db-restore:
	@echo "Usage: make db-restore FILE=backups/dump_20260402.sql"
	@test -n "$(FILE)" || (echo "ERROR: specify FILE=path/to/dump.sql" && exit 1)
	docker compose exec -T db psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-upwork_proposals} < $(FILE)
	@echo "Database restored from $(FILE)"

db-reset:
	@echo "WARNING: This will delete ALL data!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose down -v
	docker compose up -d db
	@sleep 5
	docker compose up -d backend
	@echo "Database reset complete."

### Dependencies ###########################################

install-backend:
	docker compose exec backend npm install

install-dashboard:
	docker compose exec dashboard npm install

install-all: install-backend install-dashboard

add-backend-dep:
	@echo "Usage: make add-backend-dep PKG=express"
	@test -n "$(PKG)" || (echo "ERROR: specify PKG=package-name" && exit 1)
	docker compose exec backend npm install $(PKG)

add-dashboard-dep:
	@echo "Usage: make add-dashboard-dep PKG=recharts"
	@test -n "$(PKG)" || (echo "ERROR: specify PKG=package-name" && exit 1)
	docker compose exec dashboard npm install $(PKG)

### Shell Access ###########################################

shell-backend:
	docker compose exec backend sh

shell-dashboard:
	docker compose exec dashboard sh

shell-db:
	docker compose exec db sh

### Health & Status ########################################

health:
	@echo "=== Service Health ==="
	@docker compose ps
	@echo ""
	@echo "=== Backend ==="
	@curl -sf http://localhost:$${BACKEND_PORT:-3002}/health 2>/dev/null | python3 -m json.tool || echo "UNREACHABLE"
	@echo ""
	@echo "=== Dashboard ==="
	@curl -sf -o /dev/null -w "HTTP %{http_code}" http://localhost:$${DASHBOARD_PORT:-3003}/profile 2>/dev/null && echo " OK" || echo "UNREACHABLE"
	@echo ""
	@echo "=== Database ==="
	@docker compose exec -T db pg_isready -U $${POSTGRES_USER:-postgres} 2>/dev/null || echo "UNREACHABLE"

status: health

### API Testing ############################################

test-api:
	@echo "=== Health ==="
	@curl -s http://localhost:$${BACKEND_PORT:-3002}/health | python3 -m json.tool
	@echo "=== Profile ==="
	@curl -s http://localhost:$${BACKEND_PORT:-3002}/api/profile | python3 -c "import sys,json; d=json.load(sys.stdin); print('Profile:', d.get('full_name','(empty)'))"
	@echo "=== Templates ==="
	@curl -s http://localhost:$${BACKEND_PORT:-3002}/api/templates | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d), 'templates')"
	@echo "=== Projects ==="
	@curl -s http://localhost:$${BACKEND_PORT:-3002}/api/projects | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d), 'projects')"
	@echo "=== Proposals ==="
	@curl -s http://localhost:$${BACKEND_PORT:-3002}/api/proposals | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d), 'proposals')"
	@echo "=== Analytics ==="
	@curl -s http://localhost:$${BACKEND_PORT:-3002}/api/analytics | python3 -c "import sys,json; d=json.load(sys.stdin); print('Total:', d['summary']['total'], '| Win rate:', d['summary']['winRate'], '%')"

### Cleanup ################################################

clean-uploads:
	@echo "Removing uploaded files older than 30 days..."
	docker compose exec -T backend find /app/uploads -type f -mtime +30 -delete 2>/dev/null || true
	@echo "Done."

clean-up-deep:
	docker image prune --all -f; docker container prune -f; docker volume prune -f;

prune-force:
	docker system prune -a -f; docker volume prune --force; docker image prune --force; docker container prune --force;

### Quick Setup ############################################

setup:
	@echo "=== Setting up Upwork Proposal Automator ==="
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example")
	@mkdir -p data/postgres backend/uploads
	docker compose up --build -d
	@echo ""
	@echo "Waiting for services to start..."
	@sleep 30
	@$(MAKE) health
	@echo ""
	@echo "=== Setup Complete ==="
	@echo "Backend:   http://localhost:$${BACKEND_PORT:-3002}"
	@echo "Dashboard: http://localhost:$${DASHBOARD_PORT:-3003}"
	@echo "Database:  localhost:$${DB_PORT:-5433}"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Go to http://localhost:$${DASHBOARD_PORT:-3003}/profile and fill in your CV"
	@echo "  2. Load the extension in Chrome: chrome://extensions → Load unpacked → select extension/"
	@echo "  3. Configure your API key in the extension settings"

setup-prod:
	@echo "=== Production Setup ==="
	@test -f .env || (cp .env.prod.example .env && echo "Created .env from .env.prod.example — EDIT PASSWORDS!")
	docker compose -f docker-compose.prod.yml up --build -d
	@echo ""
	@sleep 30
	@$(MAKE) health

### Git Flow ###############################################

# Start a new feature branch from develop
# Usage: make feature NAME=my-feature-name
feature:
	@test -n "$(NAME)" || (echo "ERROR: specify NAME=feature-name" && exit 1)
	git checkout develop
	git pull origin develop
	git checkout -b feature/$(NAME)
	@echo "Created feature/$(NAME) from develop"

# Finish a feature — merge into develop locally, push, delete branch
# Usage: make feature-done
feature-done:
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if echo "$$BRANCH" | grep -q "^feature/"; then \
		echo "Finishing $$BRANCH..."; \
		git checkout develop; \
		git pull origin develop; \
		git merge --no-ff $$BRANCH -m "Merge $$BRANCH into develop"; \
		git push origin develop; \
		git branch -d $$BRANCH; \
		git push origin --delete $$BRANCH 2>/dev/null || true; \
		echo "✓ $$BRANCH merged into develop and cleaned up"; \
	else \
		echo "ERROR: Not on a feature branch (current: $$BRANCH)"; \
	fi

# Finish a feature via PR (alternative — creates GitHub PR instead of local merge)
# Usage: make feature-pr
feature-pr:
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if echo "$$BRANCH" | grep -q "^feature/"; then \
		git push -u origin $$BRANCH; \
		gh pr create --base develop --title "$$BRANCH" --body "Feature branch merge to develop" --fill; \
	else \
		echo "ERROR: Not on a feature branch (current: $$BRANCH)"; \
	fi

# Start a release branch from develop
# Usage: make release VERSION=1.1.0
release:
	@test -n "$(VERSION)" || (echo "ERROR: specify VERSION=x.x.x" && exit 1)
	git checkout develop
	git pull origin develop
	git checkout -b release/$(VERSION)
	@echo "Created release/$(VERSION) from develop"

# Finish a release — merge to main and develop, tag it
# Usage: make release-done VERSION=1.1.0
release-done:
	@test -n "$(VERSION)" || (echo "ERROR: specify VERSION=x.x.x" && exit 1)
	git checkout main
	git pull origin main
	git merge --no-ff release/$(VERSION) -m "Release $(VERSION)"
	git tag -a v$(VERSION) -m "Release $(VERSION)"
	git push origin main --tags
	git checkout develop
	git merge --no-ff release/$(VERSION) -m "Merge release $(VERSION) back to develop"
	git push origin develop
	git branch -d release/$(VERSION)
	git push origin --delete release/$(VERSION)
	@echo "Released v$(VERSION) — merged to main + develop, tagged"

# Start a hotfix branch from main
# Usage: make hotfix NAME=fix-critical-bug
hotfix:
	@test -n "$(NAME)" || (echo "ERROR: specify NAME=hotfix-name" && exit 1)
	git checkout main
	git pull origin main
	git checkout -b hotfix/$(NAME)
	@echo "Created hotfix/$(NAME) from main"

# Finish a hotfix — merge to both main and develop
# Usage: make hotfix-done
hotfix-done:
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if echo "$$BRANCH" | grep -q "^hotfix/"; then \
		git checkout main && git merge --no-ff $$BRANCH -m "Hotfix: $$BRANCH" && git push origin main; \
		git checkout develop && git merge --no-ff $$BRANCH -m "Merge $$BRANCH to develop" && git push origin develop; \
		git branch -d $$BRANCH && git push origin --delete $$BRANCH; \
		echo "Hotfix merged to main + develop"; \
	else \
		echo "ERROR: Not on a hotfix branch (current: $$BRANCH)"; \
	fi

# Show current branch and status
branch:
	@echo "Current branch: $$(git rev-parse --abbrev-ref HEAD)"
	@echo ""
	@git log --oneline -5
	@echo ""
	@git status -s

### Help ###################################################

help:
	@echo "Upwork Proposal Automator — Make Commands"
	@echo ""
	@echo "DEVELOPMENT:"
	@echo "  make setup              First-time setup (builds + starts everything)"
	@echo "  make build              Build and start with logs"
	@echo "  make up-d               Start in background"
	@echo "  make up-d-build         Build and start in background"
	@echo "  make down               Stop all services"
	@echo "  make restart             Restart all services"
	@echo ""
	@echo "PRODUCTION:"
	@echo "  make setup-prod         First-time production setup"
	@echo "  make up-d-prod-build    Build and start production"
	@echo "  make down-prod          Stop production services"
	@echo ""
	@echo "MONITORING:"
	@echo "  make health             Check all service health"
	@echo "  make monitor-all        Follow all logs"
	@echo "  make monitor-backend    Follow backend logs"
	@echo "  make logs-backend       Last 50 backend log lines"
	@echo "  make dps                Docker ps -a"
	@echo ""
	@echo "DATABASE:"
	@echo "  make db-shell           PostgreSQL interactive shell"
	@echo "  make db-dump            Backup database to backups/"
	@echo "  make db-restore FILE=x  Restore from backup file"
	@echo "  make db-reset           Delete all data and start fresh"
	@echo ""
	@echo "DEPENDENCIES:"
	@echo "  make install-all        Install deps in all services"
	@echo "  make add-backend-dep PKG=x   Add npm package to backend"
	@echo ""
	@echo "TESTING:"
	@echo "  make test-api           Test all API endpoints"
	@echo ""
	@echo "CLEANUP:"
	@echo "  make down-v             Stop and remove volumes"
	@echo "  make prune-force        Remove all Docker artifacts"
	@echo ""
	@echo "GIT FLOW:"
	@echo "  make feature NAME=x     Start feature branch from develop"
	@echo "  make feature-done       Merge into develop locally + push + cleanup"
	@echo "  make feature-pr         Push + create GitHub PR (alternative)"
	@echo "  make release VERSION=x  Start release branch from develop"
	@echo "  make release-done VERSION=x  Merge to main, tag, merge back"
	@echo "  make hotfix NAME=x      Start hotfix branch from main"
	@echo "  make hotfix-done        Merge to main + develop"
	@echo "  make branch             Show current branch + status"

.PHONY: build up up-d up-d-build up-d-build-backend up-d-build-dashboard \
	build-prod up-d-prod up-d-prod-build \
	down down-v down-prod down-prod-v restart restart-backend restart-dashboard \
	dps dcps images monitor-all monitor-backend monitor-dashboard monitor-db \
	logs-backend logs-dashboard logs-db \
	db-shell db-dump db-restore db-reset \
	install-backend install-dashboard install-all add-backend-dep add-dashboard-dep \
	shell-backend shell-dashboard shell-db \
	health status test-api \
	clean-uploads clean-up-deep prune-force \
	setup setup-prod help \
	feature feature-done feature-pr release release-done hotfix hotfix-done branch

.PHONY: up dev down hr

up:
	docker compose up -d

dev:
	docker compose -f compose.dev.yml up

down:
	docker compose down

hr:
	@test -d .venv || (echo "Error: .venv not found. Run: python3 -m venv .venv && .venv/bin/pip install bleak" && exit 1)
	@.venv/bin/python -c "import bleak" 2>/dev/null || (echo "Error: bleak not installed. Run: .venv/bin/pip install bleak" && exit 1)
	.venv/bin/python backend/whoop_hr.py

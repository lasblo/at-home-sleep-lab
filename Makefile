.PHONY: up dev down ble logs

up:
	docker compose up -d

dev:
	docker compose -f compose.dev.yml up -d

down:
	docker compose down

ble:
	@test -d .venv || (echo "Error: .venv not found. Run: python3 -m venv .venv && .venv/bin/pip install bleak fastapi uvicorn" && exit 1)
	@.venv/bin/python -c "import bleak, fastapi, uvicorn" 2>/dev/null || (echo "Error: missing deps. Run: .venv/bin/pip install bleak fastapi uvicorn" && exit 1)
	.venv/bin/python ble_service.py

logs:
	docker compose logs -f

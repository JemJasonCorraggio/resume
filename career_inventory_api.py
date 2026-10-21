"""Read-only HTTP interface for the career inventory and its audit report."""

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from career_inventory_schema import audit_inventory


ROOT = Path(__file__).parent
DEFAULT_INVENTORY_PATH = ROOT / "data" / "master-career-inventory.json"
PUBLIC_DIRECTORY = ROOT / "public"


def build_inventory_response(
    inventory_path: Path,
) -> tuple[int, dict[str, object]]:
    """Load the inventory and audit it, returning an HTTP status and JSON body."""
    try:
        with inventory_path.open(encoding="utf-8") as inventory_file:
            inventory = json.load(inventory_file)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        print(f"Could not load career inventory: {exc}")
        return 500, {
            "loaded": False,
            "error": "The inventory could not be loaded. Check the API server logs.",
        }

    return 200, {
        "loaded": True,
        "inventory": inventory,
        "validation": audit_inventory(inventory),
    }


class InventoryRequestHandler(SimpleHTTPRequestHandler):
    """Serve the local static UI and its read-only inventory endpoint."""

    inventory_path = DEFAULT_INVENTORY_PATH
    allowed_origin = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIRECTORY), **kwargs)

    def _origin_is_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        return not origin or origin == self.allowed_origin

    def _add_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin and origin == self.allowed_origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")

    def do_OPTIONS(self) -> None:
        if urlsplit(self.path).path != "/api/inventory":
            self.send_error(404)
            return
        if not self._origin_is_allowed():
            self.send_error(403, "Origin is not allowed")
            return
        self.send_response(204)
        self._add_cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        if urlsplit(self.path).path != "/api/inventory":
            super().do_GET()
            return
        if not self._origin_is_allowed():
            self.send_error(403, "Origin is not allowed")
            return

        status, payload = build_inventory_response(self.inventory_path)
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._add_cors_headers()
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Serve the career inventory browser and read-only API."
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("CAREER_INVENTORY_HOST", "127.0.0.1"),
        help="interface to bind (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT", "8000")),
        help="HTTP port (default: 8000)",
    )
    parser.add_argument(
        "--inventory",
        type=Path,
        default=Path(os.environ.get("CAREER_INVENTORY_PATH", DEFAULT_INVENTORY_PATH)),
        help="inventory JSON path",
    )
    parser.add_argument(
        "--allowed-origin",
        default=os.environ.get("CAREER_INVENTORY_ALLOWED_ORIGIN", ""),
        help="single browser origin allowed to access the API cross-origin",
    )
    args = parser.parse_args()

    handler = type(
        "ConfiguredInventoryRequestHandler",
        (InventoryRequestHandler,),
        {
            "inventory_path": args.inventory,
            "allowed_origin": args.allowed_origin,
        },
    )
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Career inventory browser listening at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping career inventory browser.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

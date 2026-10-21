"""Cloudflare Python Worker serving the read-only inventory API."""

import json
from urllib.parse import urlsplit

from js import Object, Response as FetchResponse
from pyodide.ffi import JsException, to_js
from workers import WorkerEntrypoint

from career_inventory_service import (
    build_inventory_load_failure,
    build_inventory_response,
)


INVENTORY_ASSET_URL = "https://inventory/master-career-inventory.json"


def json_response(payload: dict[str, object], status: int = 200):
    options = to_js(
        {
            "status": status,
            "headers": {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
            },
        },
        dict_converter=Object.fromEntries,
    )
    return FetchResponse.new(json.dumps(payload, ensure_ascii=False), options)


def text_response(body: str, status: int, headers: dict[str, str] | None = None):
    options = to_js(
        {"status": status, "headers": headers or {}},
        dict_converter=Object.fromEntries,
    )
    return FetchResponse.new(body, options)


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        url = urlsplit(request.url)
        if url.path != "/api/inventory":
            return text_response("Not found", 404)
        if request.method != "GET":
            return text_response(
                "Method not allowed",
                405,
                {"Allow": "GET"},
            )

        try:
            asset = await self.env.INVENTORY_ASSETS.fetch(INVENTORY_ASSET_URL)
            if not asset.ok:
                raise OSError(f"Inventory asset request returned HTTP {asset.status}")
            inventory = json.loads(await asset.text())
        except (JsException, OSError, json.JSONDecodeError) as exc:
            print(f"Could not load bundled career inventory: {exc}")
            return json_response(build_inventory_load_failure(), status=500)

        return json_response(build_inventory_response(inventory))

"""Compatibility entrypoint for the shared career inventory schema module."""

from cloudflare.worker.career_inventory_schema import *


if __name__ == "__main__":
    raise SystemExit(main())

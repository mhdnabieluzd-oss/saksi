"""Run the SAKSI API with uvicorn on 127.0.0.1 (port from SAKSI_PORT, default 8000)."""

import os

import uvicorn

from saksi.api import app


def main() -> None:
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("SAKSI_PORT", "8000")))


if __name__ == "__main__":
    main()

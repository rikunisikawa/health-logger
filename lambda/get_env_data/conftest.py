"""conftest.py: Ensure correct sys.path for get_env_data Lambda tests.

This file is loaded by pytest before collecting any tests in this directory.
It prepends get_env_data/ and its sub-packages to sys.path so that
`from models import ...` resolves to get_env_data/models.py, not to
other Lambda packages (e.g. create_record/models.py) that may already
be on sys.path when running pytest from the lambda/ root.
"""
import os
import sys

_here = os.path.dirname(os.path.abspath(__file__))
_clients = os.path.join(_here, "clients")
_services = os.path.join(_here, "services")

for _p in (_services, _clients, _here):
    # Remove any existing occurrence so we can re-insert at position 0
    while _p in sys.path:
        sys.path.remove(_p)
    sys.path.insert(0, _p)

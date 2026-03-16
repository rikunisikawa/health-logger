"""conftest.py: Ensure correct sys.path for get_env_data Lambda tests.

This file is loaded by pytest before collecting any tests in this directory.
It prepends get_env_data/ and its sub-packages to sys.path so that
`from env_models import ...` resolves to get_env_data/env_models.py, not to
other Lambda packages that may already be on sys.path when running pytest
from the lambda/ root.

Note: get_env_data/ bundles pydantic/pydantic_core built for Python 3.13.
When running tests on Python <3.13 the native extension cannot load.
We therefore pre-load the system pydantic into sys.modules before inserting
_here into sys.path, so subsequent `import pydantic` calls use the cached
system version rather than the bundled one.
"""
import os
import platform
import sys

_here = os.path.dirname(os.path.abspath(__file__))
_clients = os.path.join(_here, "clients")
_services = os.path.join(_here, "services")

# Pre-load system pydantic when the bundled native extension is incompatible.
_is_py313 = platform.python_version_tuple()[0:2] == ("3", "13")
if not _is_py313:
    # Temporarily exclude _here so that `import pydantic` picks up the system copy.
    _saved = [p for p in sys.path if p == _here]
    for _p in _saved:
        sys.path.remove(_p)
    try:
        import pydantic  # noqa: F401 — populates sys.modules with system pydantic
        import pydantic_core  # noqa: F401
    except ImportError:
        pass
    # Restore _here after system pydantic is cached in sys.modules
    for _p in _saved:
        sys.path.insert(0, _p)

for _p in (_services, _clients, _here):
    # Remove any existing occurrence so we can re-insert at position 0
    while _p in sys.path:
        sys.path.remove(_p)
    sys.path.insert(0, _p)

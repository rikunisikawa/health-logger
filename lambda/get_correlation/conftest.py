import pytest
import sys
import os

_DIR = os.path.dirname(os.path.abspath(__file__))


@pytest.fixture(autouse=True)
def _set_path():
    """Ensure get_correlation/ is at the front of sys.path for each test."""
    sys.path.insert(0, _DIR)
    for mod in ["handler"]:
        sys.modules.pop(mod, None)
    yield
    if _DIR in sys.path:
        sys.path.remove(_DIR)
    for mod in ["handler"]:
        sys.modules.pop(mod, None)

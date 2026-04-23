import pytest
import sys
import os

_DIR = os.path.dirname(os.path.abspath(__file__))


@pytest.fixture(autouse=True)
def _set_path():
    sys.path.insert(0, _DIR)
    sys.modules.pop("handler", None)
    yield
    if _DIR in sys.path:
        sys.path.remove(_DIR)
    sys.modules.pop("handler", None)

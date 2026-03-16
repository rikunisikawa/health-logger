import sys
import os

# Add create_record to sys.path at collection time so module-level imports work
# (create_record/test_handler.py imports `from models import HealthRecordInput` at top level)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "create_record"))

# get_env_data/ bundles its own pydantic/pydantic_core built for Python 3.13.
# Running tests on Python <3.13 causes ModuleNotFoundError for the native extension.
# Remove the bundled paths from sys.path so the system-installed pydantic is used instead.
_get_env_data = os.path.join(os.path.dirname(__file__), "get_env_data")
for _p in list(sys.path):
    if _p.startswith(_get_env_data):
        sys.path.remove(_p)

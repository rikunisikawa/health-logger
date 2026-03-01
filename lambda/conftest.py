import sys
import os

# Add create_record to sys.path at collection time so module-level imports work
# (create_record/test_handler.py imports `from models import HealthRecordInput` at top level)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "create_record"))

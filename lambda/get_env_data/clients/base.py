import os
import sys
from abc import ABC, abstractmethod
from typing import List

# Ensure the package root (get_env_data/) is on sys.path for sibling imports
_pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)

from env_models import EnvironmentRecord


class WeatherProvider(ABC):
    @abstractmethod
    def fetch_hourly(
        self,
        lat: float,
        lng: float,
        date_from: str,
        date_to: str,
        location_id: str,
    ) -> List[EnvironmentRecord]:
        ...

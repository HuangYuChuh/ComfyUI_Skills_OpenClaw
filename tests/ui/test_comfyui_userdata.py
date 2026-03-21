from __future__ import annotations

import unittest
from unittest.mock import Mock

from ui.comfyui_userdata import ComfyUIServerAPI


class ComfyUIUserdataTests(unittest.TestCase):
    def test_list_workflow_paths_continues_when_candidate_returns_empty_payload(self) -> None:
        api = ComfyUIServerAPI("http://127.0.0.1:8188")
        first = Mock(status_code=200)
        first.json.return_value = []
        second = Mock(status_code=200)
        second.json.return_value = [{"name": "portrait.json"}]
        api.session.get = Mock(side_effect=[first, second])

        self.assertEqual(api.list_workflow_paths(), ["portrait.json"])
        self.assertEqual(api.session.get.call_count, 2)

    def test_list_workflow_paths_returns_empty_list_when_no_candidates_have_paths(self) -> None:
        api = ComfyUIServerAPI("http://127.0.0.1:8188")
        response = Mock(status_code=200)
        response.json.return_value = []
        api.session.get = Mock(return_value=response)

        self.assertEqual(api.list_workflow_paths(), [])


if __name__ == "__main__":
    unittest.main()

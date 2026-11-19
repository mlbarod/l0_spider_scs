"""Verify cluster PC feedback SQL with fake connections only."""
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import defect_cluster_pc_feedback as feedback

INFO = {"DB_HOST": "unused", "DB_PORT": 0, "DB_NAME": "unused", "DB_USER": "unused", "DB_PASSWORD": ""}
PAYLOAD = {"snapshot": "2026-11-19 07:00", "line": "L1", "device": "D", "mainSeq": "U%100", "metSeq": "200",
           "lotWf": "LOT1/01", "verdict": "N", "clusters": "[{\"r\":50}]", "knoxId": "verified"}


class FeedbackTest(unittest.TestCase):
    def fixture(self):
        connection = MagicMock()
        connection.__enter__.return_value = connection
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.execute.return_value = 1
        return connection, cursor, MagicMock(return_value=connection)

    def test_parameterized_upsert(self):
        for affected in (1, 2, 0):  # 새 행, 덮어쓰기, 같은 값 모두 정상
            with self.subTest(affected=affected):
                connection, cursor, connect = self.fixture()
                cursor.execute.return_value = affected
                with patch.object(feedback, "load_db_info", return_value=INFO):
                    self.assertEqual(feedback.save_feedback(dict(PAYLOAD), connect), {"ok": True})
                sql, params = cursor.execute.call_args.args
                self.assertIn("INSERT INTO `defect_cluster_pc_feedback`", sql)
                self.assertIn("ON DUPLICATE KEY UPDATE", sql)
                self.assertEqual(sql.count("%s"), 10)
                self.assertEqual(params[:9], ("2026-11-19 07:00", "L1", "D", "U%100", "200", "LOT1/01", "N", "[{\"r\":50}]", "verified"))
                self.assertRegex(params[9], r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")
                connection.commit.assert_called_once()

    def test_empty_clusters_saved_as_null(self):
        connection, cursor, connect = self.fixture()
        with patch.object(feedback, "load_db_info", return_value=INFO):
            feedback.save_feedback({**PAYLOAD, "clusters": ""}, connect)
        self.assertIsNone(cursor.execute.call_args.args[1][7])

    def test_invalid_verdict_or_db_error_does_not_commit(self):
        connection, cursor, connect = self.fixture()
        with patch.object(feedback, "load_db_info", return_value=INFO):
            with self.assertRaises(ValueError):
                feedback.save_feedback({**PAYLOAD, "verdict": "X"}, connect)
        connect.assert_not_called()
        connection, cursor, connect = self.fixture()
        cursor.execute.side_effect = RuntimeError("synthetic failure")
        with patch.object(feedback, "load_db_info", return_value=INFO):
            with self.assertRaises(RuntimeError):
                feedback.save_feedback(dict(PAYLOAD), connect)
        connection.commit.assert_not_called()

    def test_delete_removes_only_same_verdict(self):
        connection, cursor, connect = self.fixture()
        with patch.object(feedback, "load_db_info", return_value=INFO):
            self.assertEqual(feedback.save_feedback({**PAYLOAD, "action": "delete", "clusters": None, "knoxId": "verified"}, connect), {"ok": True})
        sql, params = cursor.execute.call_args.args
        self.assertTrue(sql.startswith("DELETE FROM `defect_cluster_pc_feedback`"))
        self.assertIn("`verdict` = %s", sql)
        self.assertEqual(sql.count("%s"), 7)
        self.assertEqual(params, ("2026-11-19 07:00", "L1", "D", "U%100", "200", "LOT1/01", "N"))
        connection.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()

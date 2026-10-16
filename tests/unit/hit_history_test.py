"""Isolated query checks: no credentials, network, or production DB.

SQLite executes the queries after translating only MySQL placeholders/date syntax.
"""
import importlib.util
import base64
from pathlib import Path
import sqlite3
import unittest

spec = importlib.util.spec_from_file_location(
    "hit_history", Path(__file__).resolve().parents[2] / "scripts/hit_history.py"
)
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII="


class Connection:
    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.create_function("LOCATE", 2, lambda needle, value: value.find(needle) + 1)
        self.db.execute("CREATE TABLE hit_history_image (image_id TEXT PRIMARY KEY, image_png BLOB, byte_size, image_sha256, fingerprint)")
        self.db.execute("CREATE TABLE hit_history (update_date, line_id, sdwt, file_path, knox_id, exec_date, image_id TEXT UNIQUE REFERENCES hit_history_image(image_id))")
        self.engines = [("InnoDB",), ("InnoDB",)]

    def cursor(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def execute(self, sql, values=()):
        if "information_schema.TABLES" in sql:
            self.result = None
            return
        sql = sql.replace("DATE_ADD(%s, INTERVAL 1 DAY)", "datetime(%s, '+1 day')")
        sql = sql.replace("ON DUPLICATE KEY UPDATE `image_id` = `image_id`", "ON CONFLICT(image_id) DO NOTHING")
        sql = sql.replace(" FOR UPDATE", "")
        self.result = self.db.execute(sql.replace("%s", "?"), values)

    @property
    def rowcount(self):
        return self.result.rowcount

    def fetchone(self):
        return self.result.fetchone()

    def fetchall(self):
        if self.result is None:
            return self.engines
        return self.result.fetchall()

    def commit(self):
        self.db.commit()

    def rollback(self):
        self.db.rollback()


class HistoryTest(unittest.TestCase):
    def setUp(self):
        self.connection = Connection()
        self.addCleanup(self.connection.db.close)
        for line, team, user, path, date in [
            ("L1", "T1", "alice", "#chart#100%_TEMP", "2026-10-15 00:00:00"),
            ("L1", "T1", "bob", "#chart#TEMP", "2026-10-15 23:59:59"),
            ("L2", "T2", "alice", "#chart#PRESSURE", "2026-10-16 00:00:00"),
        ]:
            history.insert_history(self.connection, dict(
                update_date="2026-10-14", line_id=line, sdwt=team,
                knox_id=user, file_path=path, exec_date=date,
            ))

    def query(self, **filters):
        return history.list_history(self.connection, {"page": 1, "pageSize": 20, **filters})

    def test_latest_first_and_pagination(self):
        result = self.query(page=2, pageSize=1)
        self.assertEqual(result["total"], 3)
        self.assertEqual(result["records"][0]["knox_id"], "bob")
        self.assertEqual(self.query(page=4, pageSize=1)["records"], [])

    def test_inclusive_dates_and_combined_filters(self):
        result = self.query(dateFrom="2026-10-15", dateTo="2026-10-15")
        self.assertEqual(result["total"], 2)
        result = self.query(lineId="L1", sdwt="T1", knoxId="alice")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["records"][0]["knox_id"], "alice")
        self.assertNotIn("file_path", result["records"][0])
        self.assertEqual(self.connection.db.execute("SELECT file_path FROM hit_history WHERE line_id='L1' AND knox_id='alice'").fetchone()[0], "#chart#100%_TEMP")

    def test_path_search_disabled_and_sql_parameters(self):
        self.assertEqual(self.query(search="/chart/100%_")["total"], 3)
        self.assertEqual(self.query(lineId="L1' OR 1=1 --")["total"], 0)
        self.assertEqual(self.query(search="' OR 1=1 --")["total"], 3)
        self.assertEqual(self.query(lineId="L")["total"], 0)

    def snapshot_record(self):
        return dict(update_date="2026-10-15", line_id="L1", sdwt="T1",
                    knox_id="alice", file_path="#chart#TEMP", exec_date="2026-10-16 10:00:00")

    def test_binary_roundtrip_retry_and_separate_saves_same_second(self):
        record = self.snapshot_record()
        snapshot = {"imageId": "a" * 64, "imageBase64": PNG}
        self.assertTrue(history.insert_history(self.connection, record, snapshot)["created"])
        self.assertFalse(history.insert_history(self.connection, record, snapshot)["created"])
        self.assertEqual(self.query()["total"], 4)
        self.assertEqual(history.read_image(self.connection, snapshot["imageId"])["imageBase64"], PNG)
        self.assertIsInstance(self.connection.db.execute("SELECT image_png FROM hit_history_image").fetchone()[0], bytes)
        self.assertEqual(self.query()["records"][0]["image_id"], snapshot["imageId"])
        self.assertNotIn("image_png", self.query()["records"][0])
        history.insert_history(self.connection, record, {**snapshot, "imageId": "b" * 64})
        self.assertEqual(self.query()["total"], 5)
        self.assertEqual(self.connection.db.execute("SELECT COUNT(*) FROM hit_history_image").fetchone()[0], 2)
        with self.assertRaisesRegex(history.HistoryError, "HISTORY_REQUEST_CONFLICT"):
            history.insert_history(self.connection, {**record, "sdwt": "OTHER"}, snapshot)
        self.assertEqual(self.query()["total"], 5)

    def test_image_and_history_rollback_together(self):
        self.connection.db.execute("CREATE TRIGGER fail_history BEFORE INSERT ON hit_history BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            history.insert_history(self.connection, self.snapshot_record(), {"imageId": "a" * 64, "imageBase64": PNG})
        self.assertEqual(self.connection.db.execute("SELECT COUNT(*) FROM hit_history_image").fetchone()[0], 0)
        self.assertEqual(self.query()["total"], 3)

    def test_legacy_missing_image_and_nontransactional_table(self):
        self.assertTrue(all(row["image_id"] is None for row in self.query()["records"]))
        with self.assertRaisesRegex(history.HistoryError, "HISTORY_IMAGE_NOT_FOUND"):
            history.read_image(self.connection, "a" * 64)
        self.connection.engines = [("MyISAM",), ("InnoDB",)]
        with self.assertRaisesRegex(RuntimeError, "InnoDB"):
            history.insert_history(self.connection, self.snapshot_record(), {"imageId": "a" * 64, "imageBase64": PNG})
        self.assertEqual(self.query()["total"], 3)

    def test_invalid_png_does_not_insert(self):
        with self.assertRaises(ValueError):
            history.insert_history(self.connection, self.snapshot_record(), {"imageId": "a" * 64, "imageBase64": base64.b64encode(b"not a PNG").decode()})
        self.assertEqual(self.query()["total"], 3)


if __name__ == "__main__":
    unittest.main()

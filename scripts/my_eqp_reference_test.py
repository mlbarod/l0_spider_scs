import sqlite3
import unittest
from unittest.mock import MagicMock, patch

from scripts.my_eqp_reference import read_reference_rows


class MyEqpReferenceQueryTest(unittest.TestCase):
    def setUp(self):
        self.database = sqlite3.connect(":memory:")
        self.addCleanup(self.database.close)
        self.database.execute("""
            CREATE TABLE chamber_mapping (
                eqp_id TEXT, disp_name TEXT, sdwt_prod TEXT,
                prc_group TEXT, fdc_bin_prop TEXT
            )
        """)

    def read_rows(self):
        # Execute the helper's actual SELECT against synthetic data only.
        cursor = MagicMock()
        cursor.execute.side_effect = lambda query: setattr(
            cursor, "result", self.database.execute(query).fetchall()
        )
        cursor.fetchall.side_effect = lambda: cursor.result
        pymysql = MagicMock()
        connection = pymysql.connect.return_value.__enter__.return_value
        connection.cursor.return_value.__enter__.return_value = cursor
        with patch.dict("sys.modules", {"pymysql": pymysql}):
            return read_reference_rows({
                "DB_HOST": "synthetic", "DB_USER": "synthetic",
                "DB_PASSWORD": "", "DB_NAME": "synthetic", "DB_PORT": 3306,
            })

    def test_filters_categories_and_deduplicates_within_sdwt_and_group(self):
        self.database.executemany(
            "INSERT INTO chamber_mapping VALUES (?, ?, ?, ?, ?)",
            [
                ("EQP02", "B", "S1", "P1", "STRIPPER"),
                ("EQP01", "A", "S1", "P1", "ETCHER"),
                ("EQP01", "A", "S1", "P1", "STRIPPER"),
                ("EQP01", "A", "S1", "P2", "ETCHER"),
                ("EQP01", "A", "S2", "P1", "ETCHER"),
                ("EXCLUDED", "A", "S1", "OTHER", "CVD"),
                ("EXCLUDED", "A", "S1", "OTHER", None),
            ],
        )
        self.assertEqual(self.read_rows(), [
            {"main": "EQP01", "disp_name": "A", "sdwt_prod": "S1", "prc_group": "P1"},
            {"main": "EQP02", "disp_name": "B", "sdwt_prod": "S1", "prc_group": "P1"},
            {"main": "EQP01", "disp_name": "A", "sdwt_prod": "S1", "prc_group": "P2"},
            {"main": "EQP01", "disp_name": "A", "sdwt_prod": "S2", "prc_group": "P1"},
        ])

    def test_returns_empty_list_when_no_category_matches(self):
        self.database.execute(
            "INSERT INTO chamber_mapping VALUES (?, ?, ?, ?, ?)",
            ("EQP01", "A", "S1", "P1", "CVD"),
        )
        self.assertEqual(self.read_rows(), [])


if __name__ == "__main__":
    unittest.main()

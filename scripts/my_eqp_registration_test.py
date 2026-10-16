import unittest
import sqlite3
from unittest.mock import patch
from scripts import my_eqp_registration as registration

from scripts.my_eqp_registration import MY_EQP_COLUMNS, build_insert_values, build_list_query


class MyEqpRegistrationQueryTest(unittest.TestCase):
    def test_insert_values_create_each_knox_id_and_eqp_combination(self):
        values = build_insert_values({
            "line": "P1D",
            "sdwt": "DREAMS P1D",
            "prcGroup": "ETCH",
            "eqps": ["EQP01", "EQP02"],
            "execDate": "2026-07-21 10:00:00",
            "periode": 7,
            "comment": "monitor",
            "knoxId": "owner",
            "knoxIds": ["user01", "user02"],
            "isPublic": False,
        })

        self.assertEqual(len(values), 4)
        self.assertEqual([(row[7], row[3]) for row in values], [
            ("user01", "EQP01"),
            ("user01", "EQP02"),
            ("user02", "EQP01"),
            ("user02", "EQP02"),
        ])

    def test_list_query_includes_owned_and_public_rows(self):
        query, values = build_list_query({
            "line": "P1D",
            "knoxId": "user01",
            "activeOnly": True,
        })

        self.assertIn("(`knox_id` = %s OR `is_public` = 1)", query)
        self.assertIn("TIMESTAMPADD(DAY, `periode`, `exec_date`) > NOW()", query)
        self.assertEqual(values, ("P1D", "user01"))
        self.assertEqual(MY_EQP_COLUMNS[-1], "is_public")


class MyEqpStorageTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.execute("CREATE TABLE myeqp_regist (line, sdwt, prc_group, eqp, exec_date, periode, comment, knox_id, is_public)")
        self.payload = dict(line="L1", sdwt="TEAM", prcGroup="ETCH", eqps=["EQP01_A", "EQP02_B"],
                            execDate="2026-10-16 12:00:00", periode=7, comment="monitor", knoxId="owner", knoxIds=["owner", "other"], isPublic=False)
        self.connection = self.Connection(self.db)
        self.patch = patch.object(registration, "connect", return_value=self.connection)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    class Connection:
        def __init__(self, db): self.db = db
        def __enter__(self): return self
        def __exit__(self, *args):
            if args[0]: self.db.rollback()
        def cursor(self): return self
        def commit(self): self.db.commit()
        def execute(self, sql, values=()):
            assert not any(word in sql.upper() for word in ["ALTER TABLE", "CREATE TABLE"])
            sql = sql.replace("TIMESTAMPADD(DAY, `periode`, `exec_date`) > NOW()", "datetime(exec_date, '+' || periode || ' days') > '2026-10-17 12:00:00'")
            self.result = self.db.execute(sql.replace("%s", "?"), values)
            return self.result.rowcount
        def executemany(self, sql, values):
            self.result = self.db.executemany(sql.replace("%s", "?"), values)
            return self.result.rowcount
        def fetchall(self): return self.result.fetchall()

    def test_insert_expiration_scope_and_delete_only_current_recipient(self):
        self.assertEqual(registration.insert_registration(self.payload, {})["affectedRows"], 4)
        expired = {**self.payload, "execDate": "2026-09-01 00:00:00"}
        registration.insert_registration(expired, {})
        other_line = {**self.payload, "line": "L2"}
        registration.insert_registration(other_line, {})
        query = dict(line="L1", knoxId="owner", activeOnly=True)
        records = registration.list_registrations(query, {})["records"]
        self.assertEqual(len(records), 2)
        self.assertTrue(all(row["knox_id"] == "owner" for row in records))
        self.assertEqual(len(registration.list_registrations({**query, "activeOnly": False}, {})["records"]), 4)
        self.assertEqual(registration.delete_registration(self.payload, {})["affectedRows"], 2)
        self.assertEqual(registration.list_registrations(query, {})["records"], [])
        self.assertEqual(len(registration.list_registrations({**query, "knoxId": "other"}, {})["records"]), 2)
        self.assertEqual(registration.list_registrations({**query, "knoxId": "' OR 1=1 --"}, {})["records"], [])

    def test_insert_failure_rolls_back_all_recipients_and_equipment(self):
        self.db.execute("CREATE TRIGGER fail_insert BEFORE INSERT ON myeqp_regist WHEN NEW.knox_id = 'other' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            registration.insert_registration(self.payload, {})
        self.assertEqual(self.db.execute("SELECT count(*) FROM myeqp_regist").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()

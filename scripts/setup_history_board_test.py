import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import MagicMock, patch

from scripts import setup_history_board as setup


def fake_connection(new_tables, image_id_column=1):
    """information_schema 응답만 흉내 냅니다. SQL은 기록만 하고 실행하지 않습니다."""
    cursor = MagicMock()
    rows = []

    def execute(sql, params=None):
        if "information_schema.TABLES" in sql:
            existing = {"hit_history": "InnoDB", "hit_history_image": "InnoDB", **new_tables}
            rows.append([(name, engine) for name, engine in existing.items() if name in params])
        elif "information_schema.COLUMNS" in sql:
            rows.append((image_id_column,))
        elif sql.startswith("SELECT COUNT(*), COUNT(DISTINCT"):
            rows.append((5, 4, 3))
        elif sql.startswith("SELECT COUNT(*) FROM (SELECT DISTINCT"):
            rows.append((2,))
    cursor.execute.side_effect = execute
    cursor.fetchall.side_effect = lambda: rows.pop(0)
    cursor.fetchone.side_effect = lambda: rows.pop(0)
    cursor.rowcount = 1
    connection = MagicMock()
    connection.cursor.return_value.__enter__.return_value = cursor
    return connection, cursor


def statements(cursor):
    return [call.args[0] for call in cursor.execute.call_args_list]


ALL_NEW = {name: "InnoDB" for name in setup.NEW_TABLES}


class SetupHistoryBoardTest(unittest.TestCase):
    def run_quietly(self, connection, apply):
        with redirect_stdout(io.StringIO()) as output:
            setup.run(connection, apply)
        return output.getvalue()

    def test_preview_does_not_change_db(self):
        connection, cursor = fake_connection({})
        output = self.run_quietly(connection, apply=False)
        self.assertIn("미리보기", output)
        self.assertFalse(any(sql.startswith(("CREATE", "INSERT")) for sql in statements(cursor)))
        connection.commit.assert_not_called()

    def test_apply_creates_three_tables_then_copies(self):
        connection, cursor = fake_connection({})
        self.run_quietly(connection, apply=True)
        executed = statements(cursor)
        created = [sql for sql in executed if sql.startswith("CREATE TABLE")]
        self.assertEqual(len(created), 3)
        self.assertTrue(created[0].startswith("CREATE TABLE `hit_history_post`"))
        self.assertTrue(any(sql.startswith("INSERT IGNORE INTO `hit_history_post` ") for sql in executed))
        self.assertTrue(any(sql.startswith("INSERT IGNORE INTO `hit_history_post_image`") for sql in executed))
        self.assertFalse(any(sql.startswith(("DELETE", "UPDATE", "DROP", "ALTER")) for sql in executed))
        connection.commit.assert_called_once()

    def test_rerun_skips_existing_tables_and_copies_again_safely(self):
        connection, cursor = fake_connection(ALL_NEW)
        self.run_quietly(connection, apply=True)
        self.assertFalse(any(sql.startswith("CREATE TABLE") for sql in statements(cursor)))
        connection.commit.assert_called_once()

    def test_partial_new_tables_stop_without_changes(self):
        connection, cursor = fake_connection({"hit_history_post": "InnoDB"})
        with self.assertRaisesRegex(setup.SetupError, "일부만"):
            self.run_quietly(connection, apply=True)
        self.assertFalse(any(sql.startswith(("CREATE", "INSERT")) for sql in statements(cursor)))

    def test_missing_image_id_column_stops(self):
        connection, _ = fake_connection({}, image_id_column=0)
        with self.assertRaisesRegex(setup.SetupError, "image_id"):
            self.run_quietly(connection, apply=True)

    def test_empty_config_is_rejected_before_connecting(self):
        with patch.dict(setup.DB_CONFIG, {"host": "", "password": ""}), patch.dict("sys.modules", {"pymysql": MagicMock()}) as modules:
            with self.assertRaisesRegex(setup.SetupError, "host, .*password"):
                setup.connect()
            modules["pymysql"].connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()

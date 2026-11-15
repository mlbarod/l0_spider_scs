import base64
import unittest
from unittest.mock import MagicMock

from scripts.history_board import BoardError, execute_action

PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452") + bytes.fromhex("00000001000000010806000000") + bytes(4) \
    + bytes.fromhex("0000000049454e44ae426082")
POST_ID = "c" * 64


def connection_with(cursor):
    connection = MagicMock()
    connection.cursor.return_value.__enter__.return_value = cursor
    return connection


def create_payload(**overrides):
    return {
        "action": "create", "actor": "user.one", "id": POST_ID, "fingerprint": "f" * 64,
        "entryType": "HISTORY", "title": "t", "details": "d", "comment": "c", "app": "self-equipment",
        "lineId": "P1L", "sdwt": "S1", "updateDate": "2026-08-27", "filePath": "#a#b.png",
        "imageBase64": base64.b64encode(PNG).decode("ascii"), **overrides,
    }


def post_row(**overrides):
    return {"post_id": POST_ID, "entry_type": "MAIL", "knox_id": "user.one", "title": "t", "details": "d",
            "comment": "c", "app": "", "line_id": "P1L", "sdwt": "S1", "update_date": "2026-08-27",
            "work_status": "IN_PROGRESS", "version": 2, "legacy": 0, "created_at": "x", "updated_at": "x", **overrides}


def dict_cursor(row):
    cursor = MagicMock()
    cursor.description = [(name,) for name in row]
    cursor.fetchone.return_value = tuple(row.values())
    return cursor


class HistoryBoardTest(unittest.TestCase):
    def test_create_new_entry_stores_post_and_image_in_one_commit(self):
        cursor = MagicMock()
        cursor.rowcount = 1
        cursor.fetchone.return_value = ("f" * 64,)
        connection = connection_with(cursor)
        result = execute_action(connection, create_payload())
        self.assertEqual(result, {"ok": True, "id": POST_ID, "created": True})
        statements = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(any("INSERT INTO `hit_history_post_image`" in sql for sql in statements))
        connection.commit.assert_called_once()

    def test_retry_with_same_fingerprint_does_not_insert_image_again(self):
        cursor = MagicMock()
        cursor.rowcount = 0
        cursor.fetchone.return_value = ("f" * 64,)
        result = execute_action(connection_with(cursor), create_payload())
        self.assertFalse(result["created"])
        statements = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertFalse(any("hit_history_post_image" in sql for sql in statements))

    def test_reused_request_with_different_content_is_rejected(self):
        cursor = MagicMock()
        cursor.rowcount = 0
        cursor.fetchone.return_value = ("e" * 64,)
        connection = connection_with(cursor)
        with self.assertRaisesRegex(BoardError, "BOARD_REQUEST_CONFLICT"):
            execute_action(connection, create_payload())
        connection.commit.assert_not_called()

    def test_invalid_image_or_type_is_rejected(self):
        for payload in (create_payload(imageBase64=base64.b64encode(b"x" * 50).decode()), create_payload(entryType="SEND"), create_payload(entryType="MAIL")):
            with self.assertRaisesRegex(BoardError, "BOARD_INVALID"):
                execute_action(connection_with(MagicMock()), payload)

    def test_status_change_requires_current_version(self):
        cursor = dict_cursor(post_row())
        with self.assertRaisesRegex(BoardError, "BOARD_CONFLICT"):
            execute_action(connection_with(cursor), {"action": "status", "actor": "user.two", "id": POST_ID,
                                                     "status": "COMPLETED", "version": 1, "comment": ""})

    def test_status_change_records_log(self):
        cursor = dict_cursor(post_row())
        execute_action(connection_with(cursor), {"action": "status", "actor": "user.two", "id": POST_ID,
                                                 "status": "COMPLETED", "version": 2, "comment": "done"})
        statements = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(any("INSERT INTO `hit_history_post_status_log`" in sql for sql in statements))
        self.assertTrue(any("SET `work_status` = %s, `version` = `version` + 1" in sql for sql in statements))

    def test_delete_keeps_a_deleted_marker_row(self):
        cursor = dict_cursor(post_row())
        execute_action(connection_with(cursor), {"action": "delete", "actor": "master.one", "id": POST_ID})
        statements = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(any("SET `work_status` = 'DELETED'" in sql for sql in statements))
        self.assertFalse(any(sql.startswith("DELETE FROM `hit_history_post` ") for sql in statements))

    def test_reads_do_not_need_actor_but_writes_do(self):
        cursor = dict_cursor(post_row())
        cursor.fetchone.side_effect = [tuple(post_row().values()), (1,)]
        cursor.fetchall.return_value = []
        result = execute_action(connection_with(cursor), {"action": "detail", "id": POST_ID})
        self.assertTrue(result["post"]["hasImage"])
        for payload in (create_payload(actor=None), {"action": "delete", "id": POST_ID},
                        {"action": "status", "id": POST_ID, "status": "COMPLETED", "version": 2, "comment": ""}):
            with self.assertRaisesRegex(BoardError, "BOARD_INVALID"):
                execute_action(connection_with(MagicMock()), payload)

    def test_deleted_entry_is_not_found(self):
        cursor = dict_cursor(post_row(work_status="DELETED"))
        with self.assertRaisesRegex(BoardError, "BOARD_NOT_FOUND"):
            execute_action(connection_with(cursor), {"action": "detail", "actor": "user.one", "id": POST_ID})


if __name__ == "__main__":
    unittest.main()

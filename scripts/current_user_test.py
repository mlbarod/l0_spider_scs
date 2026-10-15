import contextlib
import io
import json
import os
import unittest
from unittest.mock import patch

import current_user


class FakeConnection:
    def __init__(self):
        self.users = {}
        self.commits = 0
        self.rollbacks = 0
        self.queries = []
        self.row = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def cursor(self):
        return self

    def execute(self, sql, params):
        self.queries.append((sql, params))
        if sql.startswith("INSERT"):
            self.users.setdefault(params[0], params[1])
        else:
            value = self.users.get(params[0])
            self.row = (value,) if value else None

    def fetchone(self):
        return self.row

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class CurrentUserTests(unittest.TestCase):
    def run_main(self, connection, ip, payload, failure=None):
        out = io.StringIO()
        with patch.dict(os.environ, {"REMOTE_ADDR": ip}), \
                patch("sys.stdin", io.StringIO(json.dumps(payload))), \
                patch.object(current_user, "connect", return_value=connection, side_effect=failure) as connect, \
                contextlib.redirect_stdout(out):
            current_user.main()
        return json.loads(out.getvalue()), connect.call_count

    def test_lookup_register_reconnect_and_multiple_ips(self):
        db = FakeConnection()
        self.assertTrue(current_user.lookup_user(db, "192.0.2.10")["registrationRequired"])
        for ip in ("192.0.2.10", "2001:db8::42"):
            self.assertTrue(current_user.register_user(db, ip, "example.user")["ok"])
            self.assertEqual(current_user.lookup_user(db, ip)["knoxId"], "example.user")
        self.assertEqual(db.commits, 2)
        for sql, params in db.queries:
            self.assertNotIn("example.user", sql)
            self.assertIsInstance(params, tuple)

    def test_duplicate_and_conflicting_registration_never_overwrite(self):
        db = FakeConnection()
        for _ in range(2):
            self.assertTrue(current_user.register_user(db, "192.0.2.10", "first")["ok"])
        result = current_user.register_user(db, "192.0.2.10", "second")
        self.assertEqual(result["code"], "IP_ALREADY_REGISTERED")
        self.assertEqual(db.users["192.0.2.10"], "first")
        self.assertEqual(db.rollbacks, 1)
        self.assertTrue(any("FOR UPDATE" in sql for sql, _ in db.queries))

    def test_main_canonicalizes_addresses(self):
        db = FakeConnection()
        for supplied, canonical in [
            ("::ffff:192.0.2.10", "192.0.2.10"),
            ("2001:0DB8:0:0:0:0:0:42", "2001:db8::42"),
            ("::FFFF:c000:20a", "192.0.2.10"),
        ]:
            result, calls = self.run_main(db, supplied, {"action": "register", "knoxId": "example.user"})
            self.assertEqual(result["ipAddress"], canonical)
            self.assertEqual(calls, 1)

    def test_main_rejects_invalid_input_without_db(self):
        for ip, payload, code in [
            ("invalid", {}, "IP_NOT_FOUND"),
            ("192.0.2.10", {"action": "delete"}, "INVALID_USER_REQUEST"),
            ("192.0.2.10", None, "INVALID_USER_REQUEST"),
            ("192.0.2.10", {"action": "register", "knoxId": "bad@id"}, "INVALID_KNOX_ID"),
            ("192.0.2.10", {"action": "register", "knoxId": "x" * 129}, "INVALID_KNOX_ID"),
        ]:
            result, calls = self.run_main(FakeConnection(), ip, payload)
            self.assertEqual(result["code"], code)
            self.assertEqual(calls, 0)

    def test_db_failure_is_not_an_unregistered_user(self):
        result, _ = self.run_main(None, "192.0.2.10", {}, RuntimeError("synthetic secret"))
        self.assertEqual(result, {"ok": False, "code": "CURRENT_USER_DB_FAILED"})


if __name__ == "__main__":
    unittest.main()

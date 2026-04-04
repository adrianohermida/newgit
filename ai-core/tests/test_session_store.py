from __future__ import annotations

import json
import unittest

from core.session_store import (
    InvalidSessionIdError,
    SessionCorruptedError,
    SessionNotFoundError,
    StoredSession,
    load_session,
    sanitize_session_id,
    save_session,
)
from tests.fixtures import TempPathsMixin


class SessionStoreTests(TempPathsMixin):

    def test_save_and_load_session_with_sanitized_id(self) -> None:
        temp_dir = self.make_temp_session_dir()
        session = StoredSession(
            session_id='team/session 01',
            messages=('hello',),
            input_tokens=1,
            output_tokens=2,
        )
        path = save_session(session, directory=temp_dir)
        loaded = load_session('team/session 01', directory=temp_dir)

        self.assertTrue(path.name.startswith('team_session_01'))
        self.assertEqual(loaded.session_id, 'team/session 01')
        self.assertEqual(loaded.messages, ('hello',))

    def test_load_session_missing_file_raises_explicit_error(self) -> None:
        temp_dir = self.make_temp_session_dir()
        with self.assertRaises(SessionNotFoundError):
            load_session('missing-session', directory=temp_dir)

    def test_load_session_invalid_json_raises_corrupted_error(self) -> None:
        temp_dir = self.make_temp_session_dir()
        target = temp_dir / 'broken.json'
        target.write_text('{not json}', encoding='utf-8')
        with self.assertRaises(SessionCorruptedError):
            load_session('broken', directory=temp_dir)

    def test_load_session_missing_fields_raises_corrupted_error(self) -> None:
        temp_dir = self.make_temp_session_dir()
        target = temp_dir / 'partial.json'
        target.write_text(json.dumps({'session_id': 'partial'}), encoding='utf-8')
        with self.assertRaises(SessionCorruptedError):
            load_session('partial', directory=temp_dir)

    def test_sanitize_session_id_rejects_empty_ids(self) -> None:
        with self.assertRaises(InvalidSessionIdError):
            sanitize_session_id('///')

#!/usr/bin/env python3
"""Installer regressions; integration uses a disposable PostgreSQL cluster and port."""
from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('setup_local', ROOT / 'scripts/setup-local.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class InstallerTests(unittest.TestCase):
    def test_installer_and_runtime_share_verified_offline_models(self):
        downloads = []
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder)
            def download(url, destination, digest):
                downloads.append((url, destination, digest))
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.touch()
            with patch.object(setup.runtime, 'CACHE', cache), patch.object(setup.pg, 'download', side_effect=download):
                setup.install_models()
                env = setup.runtime.environment()
                whisper = Path(env['WHISPER_MODEL'])
                self.assertTrue((whisper / 'model.bin').exists())
                self.assertTrue((whisper / 'preprocessor_config.json').exists())
                self.assertTrue((whisper / 'vocabulary.json').exists())
                self.assertIn('faster-whisper-large-v3-turbo', str(whisper))
                self.assertEqual(env['WHISPER_CPU_THREADS'], '6')
                self.assertEqual(env['WHISPER_MAX_CONCURRENT'], '1')
                self.assertEqual(env['WHISPER_DEVICE'], 'cpu')
                self.assertEqual(env['WHISPER_COMPUTE_TYPE'], 'int8')
                self.assertEqual(env['OPENJEV_MODEL'], 'qwen3.5-2b-local')
                self.assertEqual(env['HF_HUB_OFFLINE'], '1')
                self.assertGreaterEqual(int(env['WHISPER_TIMEOUT_MS']), 120000)
                self.assertLess(float(env['OPENJEV_LLAMA_TIMEOUT_SECONDS'])*1000, int(env['OPENJEV_TIMEOUT_MS']))
        self.assertEqual(len(downloads), 6)
        for url, destination, digest in downloads:
            self.assertIn('/resolve/' + destination.parent.name + '/', url)
            self.assertNotIn('/resolve/main/', url)
            self.assertRegex(digest, r'^[0-9a-f]{64}$')
        command = setup.runtime.qwen_command()
        self.assertEqual(command[command.index('-m')+1], str(setup.runtime.MODEL))
        self.assertIn('Qwen3.5-2B-Q4_K_M.gguf', str(setup.runtime.MODEL))
        self.assertEqual(command[command.index('-ngl')+1], '0')

    def test_incomplete_models_block_runtime_before_launch(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            binary = root / 'postgres'
            binary.touch()
            with patch.multiple(setup.runtime, PG=root, PYTHON=binary, MODEL=binary, LLAMA=binary, CACHE=root), patch.object(setup.runtime.subprocess, 'check_output', return_value='1.4.0\n'):
                with self.assertRaisesRegex(RuntimeError, 'ausente ou incompleto'):
                    setup.runtime.check_versions()

    def test_download_reuses_valid_and_replaces_only_verified_content(self):
        with tempfile.TemporaryDirectory() as folder:
            source, destination = Path(folder) / 'source', Path(folder) / 'destination'
            source.write_bytes(b'verified')
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            destination.write_bytes(b'corrupt')
            setup.pg.download(source.as_uri(), destination, digest)
            self.assertEqual(destination.read_bytes(), b'verified')
            with patch.object(setup.pg, 'urlopen', side_effect=AssertionError('No download required')):
                setup.pg.download(source.as_uri(), destination, digest)
            destination.write_bytes(b'old')
            source.write_bytes(b'bad download')
            with self.assertRaisesRegex(RuntimeError, 'Checksum'):
                setup.pg.download(source.as_uri(), destination, digest)
            self.assertEqual(destination.read_bytes(), b'old')
            self.assertFalse(destination.with_suffix('.download').exists())

    def test_existing_cluster_never_regenerates_missing_credentials(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            data = root / 'data'
            data.mkdir()
            (data / 'PG_VERSION').write_text('18\n')
            with patch.multiple(setup.database, DATA=data, ENV=root / 'missing.env'):
                with self.assertRaisesRegex(RuntimeError, 'credenciais'):
                    setup.database.prepare()
            self.assertFalse((root / 'missing.env').exists())

    def test_configuration_preserves_existing_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            local = root / 'codex-scripts'
            local.mkdir()
            (root / '.env').write_text('USER_SETTING=keep\n')
            (local / 'web.env').write_text('BETTER_AUTH_SECRET=keep\n')
            with patch.multiple(setup, ROOT=root, LOCAL=local), patch.object(setup.database, 'prepare'):
                setup.prepare_configuration()
                setup.prepare_configuration()
            self.assertEqual((root / '.env').read_text(), 'USER_SETTING=keep\n')
            self.assertEqual((local / 'web.env').read_text(), 'BETTER_AUTH_SECRET=keep\n')

    def test_competing_setup_does_not_stop_runtime(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(setup, 'LOCAL', Path(folder)), patch.object(setup, 'preflight'), patch.object(setup.runtime, 'stop') as stop:
            with (Path(folder) / 'setup.lock').open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaisesRegex(RuntimeError, 'Outro instalador'):
                    setup.install()
            stop.assert_not_called()

    def test_preflight_failure_does_not_stop_runtime(self):
        with patch.object(setup, 'preflight', side_effect=RuntimeError('missing prerequisite')), patch.object(setup.runtime, 'stop') as stop:
            with self.assertRaisesRegex(RuntimeError, 'missing prerequisite'):
                setup.install()
            stop.assert_not_called()

    def test_order_and_database_cleanup_on_migration_failure(self):
        for fail in (False, True):
            with self.subTest(fail=fail), tempfile.TemporaryDirectory() as folder:
                events = []
                @contextmanager
                def database():
                    events.append('database-start')
                    try:
                        yield
                    finally:
                        events.append('database-stop')
                def migrate(*args, **kwargs):
                    events.append('migrate')
                    if fail:
                        raise RuntimeError('migration failed')
                with patch.object(setup, 'LOCAL', Path(folder)), patch.object(setup, 'preflight'), patch.object(setup.runtime, 'stop', side_effect=lambda: events.append('stop')), patch.object(setup, 'install_bun', return_value='/test/bin/bun'), patch.object(setup, 'install_dependencies', side_effect=lambda _: events.append('dependencies')), patch.object(setup, 'prepare_configuration'), patch.object(setup, 'temporary_database', database), patch.object(setup.database, 'bootstrap', side_effect=lambda: events.append('bootstrap')), patch.object(setup.subprocess, 'run', side_effect=migrate), patch.object(setup.runtime, 'build', side_effect=lambda **_: events.append('build')), patch.dict(os.environ), patch.object(setup.runtime, 'BUN'):
                    if fail:
                        with self.assertRaisesRegex(RuntimeError, 'migration failed'):
                            setup.install()
                    else:
                        setup.install()
                self.assertEqual(events, ['stop', 'dependencies', 'database-start', 'bootstrap', 'migrate', 'database-stop'] + ([] if fail else ['build']))

    def test_occupied_port_does_not_launch_or_stop_foreign_database(self):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            sock.listen()
            port = sock.getsockname()[1]
            with patch.object(setup.database, 'read_environment', return_value={'PG_PORT': str(port)}), patch.object(setup.subprocess, 'Popen') as launch:
                with self.assertRaisesRegex(RuntimeError, 'ocupada'):
                    with setup.temporary_database():
                        self.fail('Must not enter')
                launch.assert_not_called()

    @unittest.skipUnless(os.environ.get('ELYSIUM_SETUP_DATABASE_TEST') == '1', 'Set ELYSIUM_SETUP_DATABASE_TEST=1 to run disposable PostgreSQL integration')
    def test_fresh_cluster_migrations_and_repeat_preserve_data_and_credentials(self):
        with tempfile.TemporaryDirectory(prefix='elysium-setup-qa-') as folder:
            root = Path(folder)
            local = root / 'codex-scripts'
            local.mkdir()
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                port = sock.getsockname()[1]
            with patch.multiple(setup, ROOT=root, LOCAL=local), patch.multiple(setup.database, ROOT=root, DATA=root / 'storage/postgresql', ENV=local / 'database.env', SOCKET=local / 'socket', PORT=port):
                setup.prepare_configuration()
                credentials = (local / 'database.env').read_bytes()
                web = (local / 'web.env').read_bytes()
                values = setup.database.read_environment()
                env = {**os.environ, 'PGPASSWORD': values['PG_ADMIN_PASSWORD'], 'QA_DATABASE_URL': values['MIGRATION_DATABASE_URL']}
                command = [str(setup.database.BIN / 'psql'), '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', str(port), '-U', values['PG_ADMIN_USER'], '-d', 'elysium', '-tAc']
                def query(sql):
                    return subprocess.check_output(command + [sql], env=env, text=True).strip()
                bun = shutil.which('bun')
                for attempt in range(2):
                    setup.prepare_configuration()
                    with setup.temporary_database():
                        setup.database.bootstrap()
                        subprocess.run([bun, '-e', "import {migrateDatabase} from './src/database/migrate.ts'; await migrateDatabase(process.env.QA_DATABASE_URL)"], cwd=ROOT, env=env, check=True)
                        if attempt == 0:
                            query("CREATE TABLE installer_test (value text); INSERT INTO installer_test VALUES ('preserved')")
                        self.assertEqual(query('SELECT value FROM installer_test'), 'preserved')
                        self.assertEqual(query("SELECT count(*) FROM pg_roles WHERE rolname IN ('elysium_gateway','elysium_worker','elysium_web')"), '3')
                        self.assertEqual(query("SELECT count(*) FROM information_schema.tables WHERE table_schema='auth_private' AND table_name='session_keys'"), '1')
                    self.assertFalse((root / 'storage/postgresql/postmaster.pid').exists())
                    self.assertEqual((local / 'database.env').read_bytes(), credentials)
                    self.assertEqual((local / 'web.env').read_bytes(), web)
                with self.assertRaisesRegex(RuntimeError, 'simulated migration failure'):
                    with setup.temporary_database():
                        raise RuntimeError('simulated migration failure')
                self.assertFalse((root / 'storage/postgresql/postmaster.pid').exists())
                self.assertEqual((local / 'database.env').stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()

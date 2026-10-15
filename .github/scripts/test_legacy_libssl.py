"""Checksum-before-install and no-retry acquisition behavior; no package is installed."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

parser = argparse.ArgumentParser(add_help=False)
parser.add_argument('--installer', type=Path, default=Path(__file__).with_name('install-legacy-libssl.sh'))
options, unittest_args = parser.parse_known_args()
INSTALLER = options.installer.resolve()
PAYLOAD = b'synthetic opaque package fixture\n'
EXPECTED = hashlib.sha256(PAYLOAD).hexdigest()


class LegacyRuntimeAcquisition(unittest.TestCase):
    def run_case(self, mode):
        with tempfile.TemporaryDirectory(dir=os.environ['RUNNER_TEMP']) as temp:
            root = Path(temp)
            bindir = root / 'bin'
            bindir.mkdir()
            calls = root / 'requests'
            installed = root / 'installed.json'
            # Replace only network and privileged installation boundaries.
            curl = bindir / 'curl'
            curl.write_text(f'''#!{sys.executable}
import pathlib, sys
args = sys.argv[1:]
with pathlib.Path({str(calls)!r}).open('a') as stream: stream.write(args[-1] + "\\n")
headers = pathlib.Path(args[args.index('--dump-header') + 1])
if {mode!r} in ('rate', 'body-rate'):
    headers.write_text('HTTP/2 429\\n' + ('Retry-After: 60\\n' if {mode!r} == 'rate' else ''))
    if '--fail-with-body' in args:
        body = b'{{"retry_after":90,"error":{{"details":[{{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"120s"}}]}}}}' if {mode!r} == 'body-rate' else b''
        pathlib.Path(args[args.index('--output') + 1]).write_bytes(body)
    sys.exit(22)
headers.write_text('HTTP/2 200\\n')
body = {PAYLOAD!r} + (b'corruption' if {mode!r} == 'corrupt' else b'')
pathlib.Path(args[args.index('--output') + 1]).write_bytes(body)
''')
            sudo = bindir / 'sudo'
            sudo.write_text(f'''#!{sys.executable}
import hashlib, json, pathlib, sys
assert sys.argv[1:3] == ['dpkg', '--install'], sys.argv
archive = pathlib.Path(sys.argv[3])
pathlib.Path({str(installed)!r}).write_text(json.dumps({{"sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "name": archive.name}}))
''')
            curl.chmod(0o755)
            sudo.chmod(0o755)
            env = dict(os.environ, PATH=str(bindir) + os.pathsep + os.environ['PATH'], RUNNER_TEMP=str(root))
            result = subprocess.run(['bash', '-c', 'source "$1"; install_legacy_libssl "$2" "$3"',
                                     'runtime-test', str(INSTALLER), 'https://example.invalid/runtime.deb', EXPECTED],
                                    env=env, capture_output=True, text=True, check=False)
            return result, calls.read_text().splitlines(), json.loads(installed.read_text()) if installed.exists() else None

    def test_verified_bytes_reach_install(self):
        """Valid downloaded bytes are installed; rejecting all downloads breaks this output assertion."""
        result, calls, installed = self.run_case('valid')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(installed, {'sha256': EXPECTED, 'name': 'libssl1.1.deb'})
        self.assertEqual(calls, ['https://example.invalid/runtime.deb'])

    def test_corruption_stops_before_install(self):
        """Tampered bytes never reach dpkg; removing checksum verification makes this test fail."""
        result, calls, installed = self.run_case('corrupt')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('FAILED', result.stdout)
        self.assertIsNone(installed)
        self.assertEqual(calls, ['https://example.invalid/runtime.deb'])

    def test_rate_limit_stops_and_retains_wait(self):
        """A429 stops without install/retry and exposes its wait; removing the failed-fetch branch breaks it."""
        result, calls, installed = self.run_case('rate')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Retry-After: 60', result.stderr)
        self.assertIsNone(installed)
        self.assertEqual(calls, ['https://example.invalid/runtime.deb'])

    def test_body_only_rate_limit_retains_all_waits(self):
        """Body-only wait hints survive failed download; --fail or omitting the body makes this fail."""
        result, calls, installed = self.run_case('body-rate')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('"retry_after":90', result.stderr)
        self.assertIn('google.rpc.RetryInfo', result.stderr)
        self.assertIn('"retryDelay":"120s"', result.stderr)
        self.assertIsNone(installed)
        self.assertEqual(calls, ['https://example.invalid/runtime.deb'])


if __name__ == '__main__':
    unittest.main(argv=[sys.argv[0], *unittest_args])

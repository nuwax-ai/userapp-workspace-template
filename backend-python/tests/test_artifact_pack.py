"""Real ZIP/runtime fixtures; these do not claim language compiler or Docker coverage."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/artifact_pack.py'
spec = importlib.util.spec_from_file_location('runtime_artifact_pack', SCRIPT)
pack = importlib.util.module_from_spec(spec);spec.loader.exec_module(pack)


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name) / 'service';self.root.mkdir()

    def write(self, name, text):
        path = self.root / name;path.parent.mkdir(parents=True, exist_ok=True);path.write_text(text)
        return path

    def manifest(self, command='["python3","main.py"]', migrate='[]', kind='python'):
        self.write('project.manifest.toml', f'schema_version=1\n[project]\nservice_id="app"\nname="App"\ntype="{kind}"\n[run]\ncommand={command}\nmigrate={migrate}\n')

    def prior(self):
        path=self.root/'artifact.zip'
        with zipfile.ZipFile(path,'w') as archive: archive.writestr('old-valid.txt','previous-valid')
        return path.read_bytes()

    def names(self):
        with zipfile.ZipFile(self.root/'artifact.zip') as archive:
            self.assertIsNone(archive.testzip());return set(archive.namelist())

    def unpack(self):
        target=Path(self.directory.name)/'runtime';target.mkdir()
        with zipfile.ZipFile(self.root/'artifact.zip') as archive: archive.extractall(target)
        return target

    def test_source_new_modules_scripts_arbitrary_resources_run_without_source(self):
        self.write('main.py','from new_feature import render\nprint(render())\n')
        self.write('new_feature.py','from pathlib import Path\ndef render():return Path("any-new-runtime-dir/message.txt").read_text()\n')
        self.write('any-new-runtime-dir/message.txt','real-runtime-ok')
        self.write('scripts/migrate.py','print("actual-migration-ok")\n')
        self.manifest(migrate='["python3","scripts/migrate.py"]')
        pack.package_runtime(self.root,required=('main.py',))
        self.assertTrue({'main.py','new_feature.py','scripts/migrate.py','any-new-runtime-dir/message.txt'}<=self.names())
        target=self.unpack()
        for command,expected in [(['main.py'],'real-runtime-ok'),(['scripts/migrate.py'],'actual-migration-ok')]:
            result=subprocess.run([sys.executable,*command],cwd=target,env={**os.environ,'PYTHONPATH':str(target)},capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stdout.strip(),expected)

    def test_private_cache_and_prior_output_never_enter_source_artifact(self):
        self.write('main.py','pass\n')
        private=['.env','.env.production','.git/config','.agents/prompt.md','secrets/key.txt','credentials/account.json','id_rsa','cert/private.key','.deploy-operation.json']
        caches=['.pip-cache/wheel','.pytest_cache/result','__pycache__/code.pyc','.deps-stamp','.deps-build.lock','.deps-install-stale/data','node_modules/big/index.js','target/server','.artifact-old.zip','artifact.zip','builds/old.zip','logs/output.log','temporary.tmp','migration-receipts/old.json']
        for name in private+caches:self.write(name,'fixture-private-or-cache')
        self.write('.env.example','placeholder only');self.write('deps/runtime.py','dependency=True')
        pack.package_runtime(self.root,required=('main.py',))
        names=self.names()
        self.assertFalse(set(private+caches)&names)
        self.assertIn('deps/runtime.py',names);self.assertIn('.env.example',names)

    def test_missing_migrate_is_build_failure_preserving_old_valid_zip(self):
        self.write('main.py','pass\n');self.manifest(migrate='["python3","scripts/missing.py"]');old=self.prior()
        with self.assertRaisesRegex(FileNotFoundError,'scripts/missing.py'):pack.package_runtime(self.root)
        self.assertEqual((self.root/'artifact.zip').read_bytes(),old)
        self.assertEqual(list(self.root.glob('.artifact-*.zip')),[])

    def run_local_script(self, command, expected):
        target = self.unpack()
        with zipfile.ZipFile(self.root / 'artifact.zip') as archive:
            for entry in archive.infolist():
                if not entry.is_dir():
                    (target / entry.filename).chmod((entry.external_attr >> 16) & 0o777)
        result = subprocess.run(command, cwd=target, env={**os.environ, 'PYTHONPATH': str(target)}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), expected)

    def test_shell_command_text_runs_from_real_artifact_without_path_guessing(self):
        self.write('server', '#!/bin/sh\nprintf "%s" shell-runtime-ok\n').chmod(0o755)
        self.manifest(command='["sh","-c","exec ./server"]', kind='rust')
        pack.package_runtime(self.root, mode='compiled', required=('server',))
        self.assertIn('server', self.names())
        self.run_local_script(['sh', '-c', 'exec ./server'], 'shell-runtime-ok')

    def test_arbitrary_argv_data_is_not_a_declared_artifact_file(self):
        self.write('server', '#!/bin/sh\nprintf "%s|%s" "$1" "$2"\n').chmod(0o755)
        self.manifest(command='["./server","Hello.py","data/not-a-file"]', kind='rust')
        pack.package_runtime(self.root, mode='compiled', required=('server',))
        self.assertEqual(pack.command_inputs(self.root), ['server'])
        self.run_local_script(['./server', 'Hello.py', 'data/not-a-file'], 'Hello.py|data/not-a-file')

    def test_interpreter_inline_code_and_module_arguments_run_without_file_guessing(self):
        for option, entry in [('-c', 'import sys;print(sys.argv[1])'), ('-m', 'entry')]:
            with self.subTest(option=option):
                self.write('entry.py', 'import sys;print(sys.argv[1])\n')
                command = ['python3', option, entry, 'Hello.py']
                self.manifest(command=json.dumps(command))
                pack.package_runtime(self.root)
                self.assertEqual(pack.command_inputs(self.root), [])
                self.run_local_script([sys.executable, option, entry, 'Hello.py'], 'Hello.py')
                shutil.rmtree(Path(self.directory.name) / 'runtime')

    def test_relative_local_interpreter_name_can_be_a_program_with_data_arguments(self):
        for name in ['node', 'python3']:
            with self.subTest(name=name):
                self.write(name, '#!/bin/sh\nprintf "%s" "$1"\n').chmod(0o755)
                self.manifest(command=json.dumps(['./' + name, 'Hello.py']), kind='rust')
                pack.package_runtime(self.root, mode='compiled', required=(name,))
                self.assertEqual(pack.command_inputs(self.root), [name])
                self.run_local_script(['./' + name, 'Hello.py'], 'Hello.py')
                shutil.rmtree(Path(self.directory.name) / 'runtime')

    def test_only_structural_local_entries_are_required_and_preserve_old_zip(self):
        cases = [('["./missing-server","data/ignored"]', 'missing-server'),
                 ('["python3","scripts/missing.py","Hello.py"]', 'scripts/missing.py'),
                 ('["node","scripts/missing.js","Hello.py"]', 'scripts/missing.js'),
                 ('["sh","scripts/missing.sh","Hello.py"]', 'scripts/missing.sh'),
                 ('["java","-jar","missing.jar","Hello.py"]', 'missing.jar')]
        for command, required in cases:
            with self.subTest(command=command):
                self.manifest(command=command)
                old = self.prior()
                self.assertEqual(pack.command_inputs(self.root), [required])
                with self.assertRaisesRegex(FileNotFoundError, required):
                    pack.package_runtime(self.root)
                self.assertEqual((self.root / 'artifact.zip').read_bytes(), old)
                self.assertEqual(list(self.root.glob('.artifact-*.zip')), [])

    def test_io_failure_preserves_old_archive_and_cleans_only_its_tempfile(self):
        self.write('main.py','pass\n');old=self.prior()
        with patch.object(pack.shutil,'copyfileobj',side_effect=OSError('controlled write failure')):
            with self.assertRaisesRegex(OSError,'controlled write failure'):pack.package_runtime(self.root)
        self.assertEqual((self.root/'artifact.zip').read_bytes(),old)
        self.assertEqual(list(self.root.glob('.artifact-*.zip')),[])

    def test_deleted_resource_is_absent_from_fresh_zip(self):
        self.write('main.py','pass\n');self.write('new-resources/deleted.txt','old resource')
        pack.package_runtime(self.root);self.assertIn('new-resources/deleted.txt',self.names())
        (self.root/'new-resources/deleted.txt').unlink();pack.package_runtime(self.root)
        self.assertNotIn('new-resources/deleted.txt',self.names())

    def test_external_symlink_is_rejected_without_touching_previous_zip(self):
        outside=Path(self.directory.name)/'outside-private';outside.write_text('private outside')
        self.write('main.py','pass\n');(self.root/'alias').symlink_to(outside);old=self.prior()
        with self.assertRaisesRegex(ValueError,'escapes'):pack.package_runtime(self.root)
        self.assertEqual((self.root/'artifact.zip').read_bytes(),old)
        self.assertEqual(outside.read_text(),'private outside')

    def test_inside_symlink_preserves_resource_bytes_and_executable_mode(self):
        self.write('main.py','pass\n');target=self.write('runtime-data/value.txt','linked-safe')
        self.write('scripts/execute.sh','#!/bin/sh\necho ok\n').chmod(0o751)
        (self.root/'safe-alias').symlink_to(target)
        pack.package_runtime(self.root)
        with zipfile.ZipFile(self.root/'artifact.zip') as archive:
            self.assertEqual(archive.read('safe-alias'),b'linked-safe')
            self.assertEqual((archive.getinfo('scripts/execute.sh').external_attr>>16)&0o777,0o751)

    def test_private_and_cache_aliases_cannot_bypass_exclusion(self):
        for target in ['.env.private','.cache/private.txt']:
            with self.subTest(target=target):
                self.write('main.py','pass\n');secret=self.write(target,'do not publish');alias=self.root/'public-alias';alias.symlink_to(secret)
                old=self.prior()
                with self.assertRaises(ValueError):pack.package_runtime(self.root)
                self.assertEqual((self.root/'artifact.zip').read_bytes(),old);alias.unlink()

    def test_symlink_directory_cycle_is_a_failure(self):
        self.write('main.py','pass\n');(self.root/'loop').symlink_to(self.root,target_is_directory=True);old=self.prior()
        with self.assertRaisesRegex(ValueError,'cycle'):pack.package_runtime(self.root)
        self.assertEqual((self.root/'artifact.zip').read_bytes(),old)

    def test_project_exclusion_is_additive_and_cannot_remove_declared_entry(self):
        self.write('main.py','pass\n');self.write('my-dev-data/large.dat','exclude this');self.write('.artifactignore','my-dev-data/\n')
        self.manifest();pack.package_runtime(self.root);self.assertNotIn('my-dev-data/large.dat',self.names());old=(self.root/'artifact.zip').read_bytes()
        self.write('.artifactignore','main.py\n')
        with self.assertRaisesRegex(FileNotFoundError,'main.py'):pack.package_runtime(self.root)
        self.assertEqual((self.root/'artifact.zip').read_bytes(),old)
        self.write('.artifactignore','!.env\n')
        with self.assertRaisesRegex(ValueError,'negation'):pack.package_runtime(self.root)
        self.assertEqual((self.root/'artifact.zip').read_bytes(),old)

    def test_compiled_output_preserves_binary_and_arbitrary_runtime_directories(self):
        self.write('server','compiled-output-marker').chmod(0o755)
        self.write('scripts/migrate.sh','#!/bin/sh\nprintf migrated\n').chmod(0o755)
        self.write('a-new-resource-name/payload.json','{"runtime":true}')
        for name in ['src/main.rs','cmd/server/main.go','internal/handler.go','target/cache','node_modules/huge/index.js']:self.write(name,'compiler input')
        self.manifest(command='["./server"]',migrate='["sh","scripts/migrate.sh"]',kind='rust')
        pack.package_runtime(self.root,mode='compiled',required=('server',));names=self.names()
        self.assertTrue({'server','scripts/migrate.sh','a-new-resource-name/payload.json'}<=names)
        self.assertFalse(any(name.startswith(('src/','cmd/','internal/','target/','node_modules/')) for name in names))
        with zipfile.ZipFile(self.root/'artifact.zip') as archive:self.assertEqual((archive.getinfo('server').external_attr>>16)&0o777,0o755)

    def test_standalone_traced_tree_and_new_resources_run_in_isolation(self):
        node=os.environ.get('TEMPLATE_NODE_BIN')
        self.assertTrue(node and Path(node).is_file(),'Node 22 path must be explicit; no skip')
        layout=self.root/'.next/standalone'
        self.write('.next/standalone/server.js','const fs=require("fs");console.log(require("traced")+fs.readFileSync("my-new-runtime/data.txt","utf8"));\n')
        self.write('.next/standalone/node_modules/traced/index.js','module.exports="traced:";\n')
        self.write('.next/standalone/.next/static/main.js','static output')
        self.write('my-new-runtime/data.txt','real-standalone-runtime')
        self.write('scripts/new-migrate.js','console.log("new-migrate-ok");\n')
        self.write('node_modules/huge/index.js','exclude whole source dependencies')
        self.write('src/page.tsx','exclude source')
        self.manifest(command='["node","server.js"]',migrate='["node","scripts/new-migrate.js"]',kind='node')
        pack.package_runtime(self.root,mode='standalone',layout_root=layout,required=('server.js',))
        names=self.names();self.assertIn('node_modules/traced/index.js',names);self.assertNotIn('node_modules/huge/index.js',names);self.assertNotIn('src/page.tsx',names)
        target=self.unpack()
        for script,expected in [('server.js','traced:real-standalone-runtime'),('scripts/new-migrate.js','new-migrate-ok')]:
            run=subprocess.run([node,script],cwd=target,capture_output=True,text=True,env={**os.environ,'NODE_PATH':''})
            self.assertEqual(run.returncode,0,run.stderr);self.assertEqual(run.stdout.strip(),expected)

    def test_static_checks_only_built_output_and_rejects_escaping_link(self):
        self.write('index.html','source is not output');self.write('dist/assets/data.txt','built asset')
        files=pack.collect(self.root,mode='static',layout_root=self.root/'dist',include_extras=False)
        with self.assertRaisesRegex(FileNotFoundError,'index.html'):pack.require_inputs(files,['index.html'])
        (self.root/'dist/index.html').symlink_to(self.root/'index.html')
        with self.assertRaisesRegex(ValueError,'escapes'):pack.collect(self.root,mode='static',layout_root=self.root/'dist',include_extras=False)

    def static_cli(self, option, directory='dist'):
        return subprocess.run([sys.executable, str(SCRIPT), '--root', str(self.root),
                               '--mode', 'static', option, directory, '--required', 'index.html'],
                              capture_output=True, text=True)

    def test_static_check_rejects_private_bytes_in_real_dist_without_mutation(self):
        self.write('dist/index.html', '<h1>real-output</h1>')
        secret = self.write('dist/.env.production', 'controlled-private-fixture')
        before = secret.read_bytes()
        result = self.static_cli('--check-dir')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('.env.production', result.stderr)
        self.assertEqual(secret.read_bytes(), before)

    def test_static_check_rejects_safe_link_that_platform_would_skip(self):
        self.write('dist/assets/page.html', 'linked-safe-page')
        entry = self.root / 'dist/index.html'
        entry.symlink_to('assets/page.html')
        result = self.static_cli('--check-dir')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('symlink', result.stderr)
        self.assertTrue(entry.is_symlink())

    def test_static_check_rejects_directory_as_index_entry(self):
        self.write('dist/index.html/wrong-entry.txt', 'directory is not HTML')
        result = self.static_cli('--check-dir')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('regular file', result.stderr)

    def test_local_executable_directory_is_not_a_runtime_command(self):
        for populated in [False, True]:
            with self.subTest(populated=populated):
                directory = self.root / 'server'
                directory.mkdir(exist_ok=True)
                if populated:
                    self.write('server/ignored.txt', 'not an executable')
                self.manifest(command='["./server"]', kind='rust')
                old = self.prior()
                with self.assertRaisesRegex(ValueError, 'regular file'):
                    pack.package_runtime(self.root, mode='compiled')
                self.assertEqual((self.root / 'artifact.zip').read_bytes(), old)

    def test_local_executable_requires_execution_mode(self):
        self.write('server', '#!/bin/sh\necho unavailable\n').chmod(0o644)
        self.manifest(command='["./server"]', kind='rust')
        old = self.prior()
        with self.assertRaisesRegex(ValueError, 'executable'):
            pack.package_runtime(self.root, mode='compiled')
        self.assertEqual((self.root / 'artifact.zip').read_bytes(), old)

    def test_interpreter_and_jar_entries_must_be_regular_files(self):
        for command, entry in [('["python3","scripts/main.py"]', 'scripts/main.py'),
                               ('["sh","scripts/migrate.sh"]', 'scripts/migrate.sh'),
                               ('["java","-jar","app.jar"]', 'app.jar')]:
            with self.subTest(command=command):
                self.write(entry + '/not-an-entry.txt', 'directory is not a file')
                self.manifest(command=command)
                old = self.prior()
                with self.assertRaisesRegex(ValueError, 'regular file'):
                    pack.package_runtime(self.root)
                self.assertEqual((self.root / 'artifact.zip').read_bytes(), old)

    def test_required_resource_directory_remains_supported(self):
        self.write('main.py', 'pass\n')
        self.write('runtime-data/a.txt', 'resource')
        pack.package_runtime(self.root, required=('runtime-data',))
        self.assertIn('runtime-data/a.txt', self.names())

    def test_static_prepare_filters_actual_output_and_materializes_safe_links(self):
        self.write('dist/assets/page.html', 'safe-real-html').chmod(0o640)
        self.write('dist/assets/data.txt', 'safe-resource')
        self.write('dist/.env.production', 'must not publish')
        self.write('dist/cache-local/remove.txt', 'project-specific exclusion')
        self.write('.artifactignore', 'cache-local/\n')
        (self.root / 'dist/index.html').symlink_to('assets/page.html')
        (self.root / 'dist/assets-copy').symlink_to('assets', target_is_directory=True)
        self.write('source-only.txt', 'do not add source extras')
        result = self.static_cli('--prepare-dir')
        self.assertEqual(result.returncode, 0, result.stderr)
        directory = self.root / 'dist'
        self.assertEqual((directory / 'index.html').read_text(), 'safe-real-html')
        self.assertEqual((directory / 'assets-copy/data.txt').read_text(), 'safe-resource')
        self.assertEqual((directory / 'index.html').stat().st_mode & 0o777, 0o640)
        self.assertFalse(any(path.is_symlink() for path in directory.rglob('*')))
        self.assertFalse((directory / '.env.production').exists())
        self.assertFalse((directory / 'cache-local').exists())
        self.assertFalse((directory / 'source-only.txt').exists())
        # The platform consumes the actual directory, not collect()'s filtered map.
        # This independent wrapper checks that a plain recursive ZIP has safe bytes.
        wrapper = self.root / 'platform-directory-fixture.zip'
        with zipfile.ZipFile(wrapper, 'w') as archive:
            for path in directory.rglob('*'):
                if path.is_file() and not path.is_symlink():
                    archive.write(path, path.relative_to(directory).as_posix())
        with zipfile.ZipFile(wrapper) as archive:
            self.assertEqual(archive.read('index.html'), b'safe-real-html')
            self.assertEqual(archive.read('assets-copy/data.txt'), b'safe-resource')
            self.assertNotIn('.env.production', archive.namelist())
            self.assertNotIn('cache-local/remove.txt', archive.namelist())
        check = self.static_cli('--check-dir')
        self.assertEqual(check.returncode, 0, check.stderr)
        self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])
        self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])

    def test_static_prepare_rejects_unsafe_links_and_keeps_original_directory(self):
        for target in ['../private-outside.txt', '.env.production', '.cache/private.txt', '.']:
            with self.subTest(target=target):
                directory = self.root / 'dist'
                directory.mkdir(exist_ok=True)
                self.write('dist/index.html', 'previous-html')
                self.write('private-outside.txt', 'outside')
                self.write('dist/.env.production', 'private')
                self.write('dist/.cache/private.txt', 'cache')
                (directory / 'alias').symlink_to(target, target_is_directory=target == '.')
                result = self.static_cli('--prepare-dir')
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual((directory / 'index.html').read_text(), 'previous-html')
                self.assertTrue((directory / 'alias').is_symlink())
                self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])
                self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])
                shutil.rmtree(directory)

    def test_static_prepare_read_failure_preserves_original_directory(self):
        self.write('dist/index.html', 'previous-valid-html')
        with patch.object(pack.shutil, 'copyfileobj', side_effect=OSError('controlled copy failure')):
            with self.assertRaisesRegex(OSError, 'controlled copy failure'):
                pack.prepare_static_directory(self.root, Path('dist'), required=('index.html',))
        self.assertEqual((self.root / 'dist/index.html').read_text(), 'previous-valid-html')
        self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])
        self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])

    def test_static_prepare_publication_failure_restores_original_directory(self):
        self.write('dist/index.html', 'previous-valid-html')
        self.write('dist/.env.production', 'previous-private-input')
        original_replace = pack.os.replace
        def fail_publication(source, destination):
            if Path(source).name.startswith('.artifact-dir-'):
                raise OSError('controlled publication failure')
            return original_replace(source, destination)
        with patch.object(pack.os, 'replace', side_effect=fail_publication):
            with self.assertRaisesRegex(OSError, 'controlled publication failure'):
                pack.prepare_static_directory(self.root, Path('dist'), required=('index.html',))
        self.assertEqual((self.root / 'dist/index.html').read_text(), 'previous-valid-html')
        self.assertEqual((self.root / 'dist/.env.production').read_text(), 'previous-private-input')
        self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])
        self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])

    def test_static_prepare_rejects_root_or_symlink_directory(self):
        self.write('dist/index.html', 'previous-valid-html')
        (self.root / 'dist-link').symlink_to('dist', target_is_directory=True)
        for directory in ['.', 'dist-link']:
            with self.subTest(directory=directory):
                result = self.static_cli('--prepare-dir', directory)
                self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual((self.root / 'dist/index.html').read_text(), 'previous-valid-html')

    def test_zip_input_replacement_is_rejected_and_previous_zip_is_retained(self):
        self.write('main.py', 'original bytes')
        old = self.prior()
        original_copy = pack.copy_checked
        def replace_before_copy(path, observed, destination):
            # unlink/write can legitimately recycle the old inode on Linux.
            # Keep both files alive until replacement, making identity distinct.
            replacement = path.with_name(path.name + '.replacement-fixture')
            replacement.write_text('replacement bytes')
            actual = replacement.stat()
            self.assertNotEqual((actual.st_dev, actual.st_ino), (observed.st_dev, observed.st_ino))
            os.replace(replacement, path)
            return original_copy(path, observed, destination)
        with patch.object(pack, 'copy_checked', side_effect=replace_before_copy):
            with self.assertRaisesRegex(ValueError, 'identity changed'):
                pack.package_runtime(self.root)
        self.assertEqual((self.root / 'artifact.zip').read_bytes(), old)

    def test_zip_input_mutation_while_copying_is_rejected_and_previous_zip_is_retained(self):
        entry = self.write('main.py', 'original bytes')
        old = self.prior()
        original_copy = pack.shutil.copyfileobj
        def mutate_during_copy(source, destination):
            original_copy(source, destination)
            entry.write_text('modified during copy with another size')
        with patch.object(pack.shutil, 'copyfileobj', side_effect=mutate_during_copy):
            with self.assertRaisesRegex(ValueError, 'changed while copying'):
                pack.package_runtime(self.root)
        self.assertEqual((self.root / 'artifact.zip').read_bytes(), old)

    def test_static_prepare_failed_restore_retains_the_only_original_backup(self):
        self.write('dist/index.html', 'previous-valid-html')
        original_replace = pack.os.replace
        def fail_publication_and_restore(source, destination):
            if Path(source).name.startswith('.artifact-dir-'):
                raise OSError('controlled publication failure')
            if Path(source).parent.name.startswith('.artifact-backup-'):
                raise OSError('controlled restore failure')
            return original_replace(source, destination)
        with patch.object(pack.os, 'replace', side_effect=fail_publication_and_restore):
            with self.assertRaisesRegex(OSError, 'restore failure'):
                pack.prepare_static_directory(self.root, Path('dist'), required=('index.html',))
        self.assertFalse((self.root / 'dist').exists())
        backups = list(self.root.glob('.artifact-backup-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / 'original/index.html').read_text(), 'previous-valid-html')
        self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])

    def test_static_prepare_preserves_read_only_resource_modes_and_can_clean_backup(self):
        self.write('dist/index.html', 'html')
        self.write('dist/assets/data.txt', 'read-only-resource').chmod(0o440)
        (self.root / 'dist/assets').chmod(0o550)
        (self.root / 'dist').chmod(0o750)
        try:
            result = self.static_cli('--prepare-dir')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((self.root / 'dist/assets/data.txt').read_text(), 'read-only-resource')
            self.assertEqual((self.root / 'dist/assets/data.txt').stat().st_mode & 0o777, 0o440)
            self.assertEqual((self.root / 'dist/assets').stat().st_mode & 0o777, 0o550)
            self.assertEqual((self.root / 'dist').stat().st_mode & 0o777, 0o750)
            self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])
            self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])
        finally:
            for directory in [self.root / 'dist', self.root / 'dist/assets', *self.root.glob('.artifact-backup-*')]:
                if directory.exists():
                    directory.chmod(0o750)
            for directory in self.root.glob('.artifact-backup-*/original'):
                directory.chmod(0o750)
                (directory / 'assets').chmod(0o750)

    def test_frontend_build_recipes_prepare_then_check_actual_dist(self):
        repository = SCRIPT.parents[2]
        for template in ['frontend-react-vite', 'frontend-vue3-vite']:
            with self.subTest(template=template):
                service = Path(self.directory.name) / template
                shutil.copytree(repository / template / 'scripts', service / 'scripts')
                bin_directory = service / 'fixture-bin'
                bin_directory.mkdir()
                pnpm = bin_directory / 'pnpm'
                pnpm.write_text('#!/bin/sh\nset -eu\ncase "$1" in\ninstall) ;;\nrun) mkdir -p dist/assets; printf "built-html" > dist/assets/page.html; ln -s assets/page.html dist/index.html; printf "private-fixture" > dist/.env.production ;;\n*) exit 23 ;;\nesac\n')
                pnpm.chmod(0o755)
                result = subprocess.run(['sh', 'scripts/build-standalone.sh'], cwd=service,
                                        env={**os.environ, 'PATH': str(bin_directory) + os.pathsep + os.environ['PATH']},
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual((service / 'dist/index.html').read_text(), 'built-html')
                self.assertFalse((service / 'dist/index.html').is_symlink())
                self.assertFalse((service / 'dist/.env.production').exists())
                self.assertIn('prepared', result.stdout)
                self.assertIn('validated', result.stdout)

    def test_static_prepare_permission_failure_preserves_source_and_removes_only_owned_staging(self):
        self.write('dist/index.html', 'previous-valid-html')
        self.write('dist/assets/data.txt', 'original-resource').chmod(0o440)
        (self.root / 'dist/assets').chmod(0o550)
        unrelated = self.write('.artifact-dir-from-another-call/keep.txt', 'not ours')
        original_replace = pack.os.replace
        def deny_source_rename(source, destination):
            if Path(source) == self.root / 'dist':
                raise PermissionError('controlled source directory permission failure')
            return original_replace(source, destination)
        try:
            with patch.object(pack.os, 'replace', side_effect=deny_source_rename):
                with self.assertRaisesRegex(PermissionError, 'permission failure'):
                    pack.prepare_static_directory(self.root, Path('dist'), required=('index.html',))
            self.assertEqual((self.root / 'dist/index.html').read_text(), 'previous-valid-html')
            self.assertEqual((self.root / 'dist/assets/data.txt').read_text(), 'original-resource')
            self.assertEqual((self.root / 'dist/assets').stat().st_mode & 0o777, 0o550)
            self.assertEqual(unrelated.read_text(), 'not ours')
            self.assertEqual([path.name for path in self.root.glob('.artifact-dir-*')], ['.artifact-dir-from-another-call'])
            self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])
        finally:
            (self.root / 'dist/assets').chmod(0o750)

    def test_static_prepare_rejects_concurrent_new_assets_and_preserves_current_source(self):
        for name in ['late-generated.js', 'assets/late-generated.js']:
            with self.subTest(name=name):
                self.write('dist/index.html', 'initial-html')
                self.write('dist/assets/existing.js', 'initial-script')
                original_copy = pack.copy_checked
                def add_asset_after_copy(path, observed, destination):
                    original_copy(path, observed, destination)
                    if path.name == 'index.html':
                        self.write('dist/' + name, 'concurrent-generated-output')
                with patch.object(pack, 'copy_checked', side_effect=add_asset_after_copy):
                    with self.assertRaisesRegex(ValueError, 'changed during preparation'):
                        pack.prepare_static_directory(self.root, Path('dist'), required=('index.html',))
                self.assertEqual((self.root / 'dist/index.html').read_text(), 'initial-html')
                self.assertEqual((self.root / 'dist' / name).read_text(), 'concurrent-generated-output')
                self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])
                self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])
                shutil.rmtree(self.root / 'dist')

    def test_static_prepare_rejects_concurrent_removal_of_already_copied_asset(self):
        self.write('dist/index.html', 'initial-html')
        asset = self.write('dist/assets/existing.js', 'initial-script')
        original_copy = pack.copy_checked
        def delete_asset_after_copy(path, observed, destination):
            original_copy(path, observed, destination)
            if path.name == 'index.html':
                asset.unlink()
        with patch.object(pack, 'copy_checked', side_effect=delete_asset_after_copy):
            with self.assertRaisesRegex(ValueError, 'changed during preparation'):
                pack.prepare_static_directory(self.root, Path('dist'), required=('index.html',))
        self.assertEqual((self.root / 'dist/index.html').read_text(), 'initial-html')
        self.assertFalse(asset.exists(), 'must not resurrect a concurrently removed asset')
        self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])
        self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])

    def test_static_prepare_rejects_concurrent_directory_replacement(self):
        self.write('dist/index.html', 'initial-html')
        self.write('dist/assets/existing.js', 'initial-script')
        original_copy = pack.copy_checked
        def replace_directory_after_copy(path, observed, destination):
            original_copy(path, observed, destination)
            if path.name == 'index.html':
                (self.root / 'dist/assets').rename(self.root / 'old-assets-fixture')
                self.write('dist/assets/new.js', 'new-directory-generation')
        with patch.object(pack, 'copy_checked', side_effect=replace_directory_after_copy):
            with self.assertRaisesRegex(ValueError, 'changed during preparation'):
                pack.prepare_static_directory(self.root, Path('dist'), required=('index.html',))
        self.assertEqual((self.root / 'dist/assets/new.js').read_text(), 'new-directory-generation')
        self.assertFalse((self.root / 'dist/assets/existing.js').exists())
        self.assertEqual((self.root / 'old-assets-fixture/existing.js').read_text(), 'initial-script')
        self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])
        self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])

    def test_static_prepare_rejects_mutation_of_already_copied_file(self):
        self.write('dist/index.html', 'initial-html')
        asset = self.write('dist/assets/existing.js', 'initial-script')
        original_copy = pack.copy_checked
        def modify_asset_after_copy(path, observed, destination):
            original_copy(path, observed, destination)
            if path.name == 'index.html':
                asset.write_text('new concurrent bytes after the first copy')
        with patch.object(pack, 'copy_checked', side_effect=modify_asset_after_copy):
            with self.assertRaisesRegex(ValueError, 'changed during preparation'):
                pack.prepare_static_directory(self.root, Path('dist'), required=('index.html',))
        self.assertEqual(asset.read_text(), 'new concurrent bytes after the first copy')
        self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])
        self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])

    def test_static_prepare_rejects_concurrent_ignore_contract_change(self):
        for exists_before in [False, True]:
            with self.subTest(exists_before=exists_before):
                self.write('dist/index.html', 'initial-html')
                self.write('dist/resources/needed.js', 'required-resource')
                ignore = self.root / '.artifactignore'
                if exists_before:
                    ignore.write_text('resources/\n')
                original_copy = pack.copy_checked
                def change_ignore_after_copy(path, observed, destination):
                    original_copy(path, observed, destination)
                    if path.name == 'index.html':
                        ignore.write_text('# new authoritative input\n')
                with patch.object(pack, 'copy_checked', side_effect=change_ignore_after_copy):
                    with self.assertRaisesRegex(ValueError, 'changed during preparation'):
                        pack.prepare_static_directory(self.root, Path('dist'), required=('index.html',))
                self.assertEqual((self.root / 'dist/resources/needed.js').read_text(), 'required-resource')
                self.assertEqual(ignore.read_text(), '# new authoritative input\n')
                self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])
                self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])
                ignore.unlink()
                shutil.rmtree(self.root / 'dist')

    def test_static_prepare_rejects_directory_addition_even_if_mtime_is_restored(self):
        self.write('dist/index.html', 'initial-html')
        metadata = (self.root / 'dist').stat()
        original_copy = pack.copy_checked
        def add_and_restore_mtime(path, observed, destination):
            original_copy(path, observed, destination)
            self.write('dist/late.js', 'new-output')
            os.utime(self.root / 'dist', ns=(metadata.st_atime_ns, metadata.st_mtime_ns))
        with patch.object(pack, 'copy_checked', side_effect=add_and_restore_mtime):
            with self.assertRaisesRegex(ValueError, 'changed during preparation'):
                pack.prepare_static_directory(self.root, Path('dist'), required=('index.html',))
        self.assertEqual((self.root / 'dist/late.js').read_text(), 'new-output')
        self.assertEqual(list(self.root.glob('.artifact-dir-*')), [])
        self.assertEqual(list(self.root.glob('.artifact-backup-*')), [])

    def test_zip_same_inode_same_size_rewrite_before_copy_is_rejected_when_mtime_restored(self):
        entry = self.write('main.py', 'original bytes')
        observed = entry.stat()
        old = self.prior()
        original_copy = pack.copy_checked
        def mutate_before_copy(path, metadata, destination):
            entry.write_text('modified bytes')
            os.utime(entry, ns=(observed.st_atime_ns, observed.st_mtime_ns))
            actual = entry.stat()
            self.assertEqual((actual.st_dev, actual.st_ino, actual.st_size, actual.st_mtime_ns),
                             (observed.st_dev, observed.st_ino, observed.st_size, observed.st_mtime_ns))
            self.assertNotEqual(actual.st_ctime_ns, observed.st_ctime_ns)
            return original_copy(path, metadata, destination)
        with patch.object(pack, 'copy_checked', side_effect=mutate_before_copy):
            with self.assertRaisesRegex(ValueError, 'changed before copying'):
                pack.package_runtime(self.root)
        self.assertEqual((self.root / 'artifact.zip').read_bytes(), old)
        self.assertEqual(list(self.root.glob('.artifact-*.zip')), [])

    def test_zip_same_inode_same_size_rewrite_during_copy_is_rejected_when_mtime_restored(self):
        entry = self.write('main.py', 'original bytes')
        observed = entry.stat()
        old = self.prior()
        original_copy = pack.shutil.copyfileobj
        def mutate_during_copy(source, destination):
            original_copy(source, destination)
            entry.write_text('modified bytes')
            os.utime(entry, ns=(observed.st_atime_ns, observed.st_mtime_ns))
            actual = entry.stat()
            self.assertEqual((actual.st_dev, actual.st_ino, actual.st_size, actual.st_mtime_ns),
                             (observed.st_dev, observed.st_ino, observed.st_size, observed.st_mtime_ns))
            self.assertNotEqual(actual.st_ctime_ns, observed.st_ctime_ns)
        with patch.object(pack.shutil, 'copyfileobj', side_effect=mutate_during_copy):
            with self.assertRaisesRegex(ValueError, 'changed while copying'):
                pack.package_runtime(self.root)
        self.assertEqual((self.root / 'artifact.zip').read_bytes(), old)
        self.assertEqual(list(self.root.glob('.artifact-*.zip')), [])


if __name__=='__main__':unittest.main(verbosity=2)

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


if __name__=='__main__':unittest.main(verbosity=2)
